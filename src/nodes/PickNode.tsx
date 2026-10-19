// Pick points: the curves (X and the Y columns), the rules (at X = …, at Y = …, maximum, minimum, rows where …), how a
// value between the points is read, and the table of what was picked.
import { xAutoLabel, Y_AUTO } from './xAuto.ts';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { PickKind, PickRule } from '../engine/pick.ts';
import type { AppNode, PickData, PickNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { Field, InPort, Messages, NumInput, OutPort, Select, TextInput, ResultSummary } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';

const KINDS: [PickKind, string][] = [
  ['x', 'at X ='],
  ['y', 'at Y ='],
  ['max', 'maximum'],
  ['min', 'minimum'],
  ['where', 'rows where'],
];
const HINT: Record<PickKind, string> = {
  x: 'One or more X: 0.5 · 0.2, 0.5 · 0:0.1:0.8 (start:step:end) — Y and the other columns read there (at every crossing)',
  y: 'One or more Y: the X where the curve crosses it (every crossing)',
  max: 'The highest point (between the limits on X, empty: all), refined between the points by a parabola',
  min: 'The lowest point (between the limits on X, empty: all), refined between the points by a parabola',
  where: 'A condition: x, y, i (the row), n, the columns A, B, C … — e.g. x > 0.4 and y < 0',
};

export function PickNodeView({ id, data }: NodeProps<PickNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<PickData>) => updateNodeData(id, p);
  const setRule = (k: number, p: Partial<PickRule>) => set({ rules: data.rules.map((r, j) => (j === k ? { ...r, ...p } : r)) });
  const r = useNodeResult(id);
  const names = (r?.view.available ?? []).map((c) => c.name);
  const out = r?.outputs.out?.t === 'dataset' ? r.outputs.out.v : undefined;
  // absent (an older node): all, as before
  const others = data.others ?? 'all';
  return (
    <div className="node node-pick">
      <InPort label="dataset" port="dataset" id="in" title="A dataset (X and the Y columns from the designations, or chosen below), e.g. the data of a Plot curve; or a workbook (its sheet chosen at the top of the options)" />
      <NodeOptions>
      {names.length > 0 && (
        <div className="grid2">
          <Field label="X">
            <Select value={data.x || '-auto'} options={[['-auto', xAutoLabel(r?.view.available)], ['-', 'row number'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(x) => set({ x: x === '-auto' ? '' : x })} />
          </Field>
          <Field label="Y" title="The columns: 2, B-D (letters), names, A* (a pattern); empty: the Y columns (their designation) — each a curve">
            <ColumnsPicker value={data.ys} names={names} auto={Y_AUTO} onChange={(ys) => set({ ys })} />
          </Field>
        </div>
      )}
      <div className="pick-rules">
        {data.rules.map((rule, k) => (
          <div key={k} className="row pick-rule" title={HINT[rule.kind]}>
            <Select value={rule.kind} options={KINDS} onChange={(kind) => setRule(k, { kind })} />
            {rule.kind === 'max' || rule.kind === 'min' ? (
              <>
                <span className="muted">X from – to</span>
                <NumInput value={rule.from ?? NaN} placeholder="all" title="From this X (empty: the smallest)" onChange={(from) => setRule(k, { from })} />
                <span>–</span>
                <NumInput value={rule.to ?? NaN} placeholder="all" title="Up to this X (empty: the largest)" onChange={(to) => setRule(k, { to })} />
              </>
            ) : (
              <TextInput className="grow mono" value={rule.value} placeholder={rule.kind === 'where' ? 'x > 0.4 and y < 0' : rule.kind === 'x' ? '0.5 · 0.2, 0.5 · 0:0.1:0.8' : '0'} onChange={(value) => setRule(k, { value })} />
            )}
            <button className="nodrag ts-btn" title="Remove this rule" onClick={() => set({ rules: data.rules.filter((_, j) => j !== k) })}>
              <X {...IC} />
            </button>
          </div>
        ))}
        <button className="nodrag" title="Another rule: its points are added to the others" onClick={() => set({ rules: [...data.rules, { kind: 'x', value: '' }] })}>
          + Add rule
        </button>
      </div>
      <div className="grid2">
        <Field label="Between points" title="At X: a straight line between the two points around it, a spline through the curve, or the nearest point (no interpolation); also how a maximum or minimum is refined">
          <Select
            value={data.interp}
            options={[
              ['linear', 'linear'],
              ['spline', 'spline'],
              ['nearest', 'nearest point'],
            ]}
            onChange={(interp) => set({ interp })}
          />
        </Field>
        <Field label="Outside" title="An X beyond the curve: nothing, the line through its last two points (extrapolated), or the value at its end">
          <Select
            value={data.outside}
            options={[
              ['empty', 'nothing'],
              ['extrapolate', 'extrapolate'],
              ['end', 'the end value'],
            ]}
            onChange={(outside) => set({ outside })}
          />
        </Field>
        <Field label="Also read" title="The other columns of the dataset read at every point (one Y column): none, all of them, or a list — 2, B-D (letters), names, A* (a pattern)">
          <span className="row wrap">
            <Select<string>
              value={others === 'none' || others === 'all' ? others : 'list'}
              options={[
                ['none', 'no other column'],
                ['all', 'all the other columns'],
                ['list', 'a list…'],
              ]}
              onChange={(v) => set({ others: v === 'list' ? '' : v })}
            />
            {others !== 'none' && others !== 'all' && <TextInput value={others} placeholder="2, B-D, names, A*" onChange={(v) => set({ others: v })} />}
          </span>
        </Field>
        <Field label="Table" title="Long: a row per point (the column “pick” = Group: Plot these columns draws a curve per rule); wide: a row per Y column, a column per point">
          <Select
            value={data.layout}
            options={[
              ['long', 'a row per point'],
              ['wide', 'a row per run'],
            ]}
            onChange={(layout) => set({ layout })}
          />
        </Field>
      </div>
      {out && <DataPreview columns={out.columns.slice(0, 10)} rows={10} />}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" title="The points picked: the Y column (its block value when cut by Split into columns), the rule, the value asked, the row found, X, Y and the other columns read there (or a row per Y column)" />
    </div>
  );
}
