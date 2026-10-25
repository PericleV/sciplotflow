// Baseline correction: the data, the method of the baseline and its options (the list of Integrate, Peak analyzer and
// Peak width, and a polynomial through background ranges), the graph — the data with the baseline over it, the
// corrected curve below, the ranges and the points drawn on it — and the outputs.
import { xAutoLabel, Y_AUTO } from './xAuto.ts';
import type { NodeProps } from '@xyflow/react';
import type { BaselineData } from '../engine/baselinenode.ts';
import type { BaselineNode } from '../types.ts';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { BaselineFields } from './BaselineFields.tsx';
import { RegionGraph } from './RegionGraph.tsx';
import { useNode } from './useStatNode.ts';

export function XYFields<T extends { x: string; ys: string }>({ data, set, names, avail }: { data: T; set: (p: Partial<T>) => void; names: string[]; avail?: Parameters<typeof xAutoLabel>[0] }) {
  return names.length > 0 ? (
    <div className="grid2">
      <Field label="X">
        <Select value={data.x || '-auto'} options={[['-auto', xAutoLabel(avail)], ['-', 'row number'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(x) => set({ x: x === '-auto' ? '' : x } as Partial<T>)} />
      </Field>
      <Field label="Y" title="The columns: 2, B-D (letters), names, A* (a pattern); empty: the Y columns (their designation): each its own result">
        <ColumnsPicker value={data.ys} names={names} auto={Y_AUTO} onChange={(ys) => set({ ys } as Partial<T>)} />
      </Field>
    </div>
  ) : null;
}

export function BaselineNodeView({ id, data }: NodeProps<BaselineNode>) {
  const { r, names, set } = useNode<BaselineData>(id);
  const view = r?.view.region;
  const bg = data.method === 'background';
  return (
    <div className="node node-calculus">
      <InPort label="dataset" port="dataset" id="in" title="X and the Y columns (designated, or chosen below): every Y corrected" />
      <InPort label="baseline" port="dataset" id="base" title="Optional: a curve to take off (Baseline ▸ another curve ▸ the baseline input): a dataset (its first X, Y) or a column">
        <span className="muted ellipsis">{data.method === 'curve' && data.baseFrom === 'port' ? 'the baseline curve' : 'optional: Baseline ▸ another curve'}</span>
      </InPort>
      <NodeOptions>
        <XYFields data={data} set={set} names={names} avail={r?.view.available} />
        <div className="grid2">
          <BaselineFields
            layout="grid"
            title={
              bg
                ? 'A polynomial through the points of the ranges drawn on the background (where there is no peak), under all the data'
                : 'Found in every range drawn on the graph (none: all X), or a polynomial through background ranges; under the peaks (or over the dips)'
            }
            before={[['background', 'polynomial through background ranges']]}
            method={data.method}
            onMethod={(method) => set({ method: method as BaselineData['method'] })}
            opts={data.baseOpt}
            onOpts={(baseOpt) => set({ baseOpt })}
            value={data.base}
            onValue={(base) => set({ base })}
            interp={data.baseInterp}
            onInterp={(baseInterp) => set({ baseInterp })}
            curve={
              <>
                <Select
                  value={data.baseFrom === 'port' ? 'port' : 'column'}
                  title="Another column of the data, or the curve connected to the “baseline” port"
                  options={[
                    ['column', 'a column'],
                    ['port', 'the baseline input'],
                  ]}
                  onChange={(baseFrom) => set({ baseFrom })}
                />
                {data.baseFrom !== 'port' && <Select value={data.baseColumn ?? ''} options={[['', 'choose'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(baseColumn) => set({ baseColumn })} />}
              </>
            }
          />
          {bg && (
            <Field label="Degree" title="The degree of the polynomial through the background ranges (0: a constant, 1: a line …)">
              <NumInput className="tiny" min={0} max={10} step={1} value={data.bgOrder} onChange={(bgOrder) => Number.isFinite(bgOrder) && set({ bgOrder: Math.max(0, Math.min(10, Math.round(bgOrder))) })} />
            </Field>
          )}
          <Field label="Take off" title="Subtracted (the usual), or divided by (a transmission, a flat field: the data relative to the baseline)">
            <Select<BaselineData['mode']>
              value={data.mode}
              options={[
                ['subtract', 'subtract (data − baseline)'],
                ['divide', 'divide (data / baseline)'],
              ]}
              onChange={(mode) => set({ mode })}
            />
          </Field>
          {!bg && (
            <Field label="Outside the ranges" title="With ranges drawn: the points outside them left as they are, or left out (empty)">
              <Select<BaselineData['outside']> seg
                value={data.outside}
                options={[
                  ['empty', 'left out'],
                  ['keep', 'as they are'],
                ]}
                onChange={(outside) => set({ outside })}
              />
            </Field>
          )}
        </div>
        <Check label="the data too in the output" title="Every Y before its corrected curve" value={data.original} onChange={(original) => set({ original })} />
      </NodeOptions>
      {view && <RegionGraph data={data} set={set} view={view} points={data.method === 'points'} rangeHint={bg ? 'Then drag on the graph over a part of the background (no peak): the polynomial goes through the points of all the ranges' : undefined} />}
      <Messages result={r} />
      <OutPort label="corrected" port="dataset" title="X and every Y with its baseline taken off (the data too if asked)" />
      <OutPort label="baseline" port="dataset" id="base" title="X and the baseline of every Y: to the baseline port of Integrate, or a Plot" />
    </div>
  );
}
