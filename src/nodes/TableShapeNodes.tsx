// Convert columns (text read as numbers, numbers written as text), Transpose (shown as Rows to columns or Columns to
// rows) and Stack columns (columns one under the other): their settings, the table that comes out.
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import { TO_NUMBER_DEFAULTS, TO_TEXT_DEFAULTS, type ToNumberRules, type ToTextRules } from '../engine/convert.ts';
import { titleOf } from '../engine/table.ts';
import type { AppNode, ConvertData, ConvertNode, StackData, StackNode, TransposeData, TransposeNode } from '../types.ts';
import { DataPreview } from './DataNodes.tsx';
import { Check, Field, InPort, Messages, NumInput, OutPort, ResultSummary, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import type { NodeResult } from '../engine/evaluate.ts';

const FORMATS: [ToTextRules['format'], string][] = [
  ['auto', 'as it is'],
  ['fixed', 'decimals'],
  ['sig', 'significant digits'],
  ['sci', 'scientific'],
];

// how numbers are written as text: the format, its digits, a decimal comma, the template
function TextRules({ r, set }: { r: ToTextRules; set: (p: Partial<ToTextRules>) => void }) {
  return (
    <>
      <Field label="Format" title="How a number is written: as it is (up to 12 significant digits), with N decimals, with N significant digits, or scientific">
        <Select<ToTextRules['format']> value={r.format} options={FORMATS} onChange={(format) => set({ format })} />
      </Field>
      {r.format !== 'auto' && (
        <Field label="Digits">
          <NumInput value={r.digits} min={0} max={15} step={1} onChange={(digits) => set({ digits })} />
        </Field>
      )}
      <Field label="Template" title="The text written: {v} is the number (“{v} V” gives “-0.5 V”; “T = {v} K” gives “T = 300 K”)">
        <TextInput value={r.template} placeholder="{v}" onChange={(template) => set({ template })} />
      </Field>
      <Check label="decimal comma" title="1,5 instead of 1.5" value={r.comma} onChange={(comma) => set({ comma })} />
    </>
  );
}

// the ports and what comes out: a table, and a workbook (every sheet of a workbook connected)
function Outputs({ r }: { r?: NodeResult }) {
  return (
    <>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="dataset" port="dataset" title="The table that comes out (a workbook connected: its first sheet)" />
      <OutPort label="workbook" port="workbook" id="book" title="Every sheet of a workbook connected, each turned (a table: a workbook of one sheet)" />
    </>
  );
}
const preview = (r?: NodeResult) => {
  const o = r?.outputs.out;
  return o?.t === 'dataset' ? <DataPreview columns={o.v.columns.slice(0, 8)} rows={4} /> : null;
};

export function ConvertNodeView({ id, data }: NodeProps<ConvertNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<ConvertData>) => updateNodeData(id, p);
  const num: ToNumberRules = { ...TO_NUMBER_DEFAULTS, ...data.num };
  const txt: ToTextRules = { ...TO_TEXT_DEFAULTS, ...data.txt };
  const setNum = (p: Partial<ToNumberRules>) => set({ num: { ...data.num, ...p } });
  const avail = r?.view.available ?? [];
  const looks = r?.view.convert?.looks ?? [];
  const changed = r?.view.convert?.changed ?? [];
  const letter = (name: string) => columnLetter(Math.max(0, avail.findIndex((c) => c.name === name)));
  return (
    <div className="node node-convert">
      <InPort label="table" port="dataset" id="in" title="A table, or a workbook (every sheet converted)" />
      {data.to === 'numbers' && !data.cols.trim() && looks.length > 0 && (
        <div className="hint">
          Text that looks like numbers in {looks.map((q) => `${letter(q.name)} (${q.examples.join(', ')}${q.numeric > q.examples.length ? ' …' : ''})`).join('; ')}.{' '}
          <button className="nodrag" title="Read these columns as numbers (the rules in the options)" onClick={() => set({ cols: looks.map((q) => letter(q.name)).join(', ') })}>
            Convert {looks.length === 1 ? 'it' : `these ${looks.length}`}
          </button>
        </div>
      )}
      {data.to === 'numbers' && !data.cols.trim() && r && !looks.length && <div className="hint">No column with text that looks like numbers.</div>}
      <NodeOptions>
        <div className="grid2">
          <Field label="To" title="Text read as numbers, or numbers written as text">
            <Select<ConvertData['to']> seg
              value={data.to}
              options={[
                ['numbers', 'numbers'],
                ['text', 'text'],
              ]}
              onChange={(to) => set({ to })}
            />
          </Field>
          <Field label="Columns" title="The columns converted: 2-6, B-F, names (empty: none; to numbers, the node proposes those whose text looks like numbers)">
            <TextInput value={data.cols} placeholder={data.to === 'numbers' ? 'none yet (see the proposal)' : 'e.g. B, D-F'} onChange={(cols) => set({ cols })} />
          </Field>
          {data.to === 'numbers' && (
            <>
              <Field label="Decimal" title="The decimal separator of the cells: found by itself in every column, or a point, or a comma">
                <Select<ToNumberRules['decimal']>
                  value={num.decimal}
                  options={[
                    ['auto', 'found by itself'],
                    ['.', 'point (1.5)'],
                    [',', 'comma (1,5)'],
                  ]}
                  onChange={(decimal) => setNum({ decimal })}
                />
              </Field>
              <Field label="Percent" title="“25 %”: 25 (the column named in %) or 0.25">
                <Select<ToNumberRules['percent']>
                  value={num.percent}
                  options={[
                    ['number', '25 % gives 25'],
                    ['fraction', '25 % gives 0.25'],
                  ]}
                  onChange={(percent) => setNum({ percent })}
                />
              </Field>
              <Field label="Limits" title="“<0.01” (below the limit of detection): empty, the limit, or half of it; “>100”: empty or the limit">
                <Select<ToNumberRules['below']>
                  value={num.below}
                  options={[
                    ['empty', 'empty'],
                    ['limit', 'the limit'],
                    ['half', 'half the limit'],
                  ]}
                  onChange={(below) => setNum({ below })}
                />
              </Field>
              <Check label="units after the number" title="“300 K”: 300, and “(K)” goes into the column’s name when every cell has the same unit" value={num.units} onChange={(units) => setNum({ units })} />
              <Check label="value ± error" title="“1.23 ± 0.05”, “1.23(5)”: the value, and its error in a column of its own after it (±Y)" value={num.pm} onChange={(pm) => setNum({ pm })} />
              <Check label="thousands separators" title="1 200,5 · 1,200.5 · 1.200,5: the separators of thousands left out" value={num.thousands} onChange={(thousands) => setNum({ thousands })} />
              <Check label="×10^n" title="“3×10^-4”, “3·10⁻⁴”, “3x10-4”: 3e-4" value={num.times10} onChange={(times10) => setNum({ times10 })} />
              <Check label="the first number of any text" title="“Sample_300K_2h”: 300. Off by default: any text with a number in it would become that number" value={num.first} onChange={(first) => setNum({ first })} />
            </>
          )}
          {data.to === 'text' && <TextRules r={txt} set={(p) => set({ txt: { ...data.txt, ...p } })} />}
        </div>
        {changed.length > 0 && <div className="hint">Converted: {changed.join(', ')}</div>}
        {preview(r)}
      </NodeOptions>
      <Outputs r={r} />
    </div>
  );
}

export function TransposeNodeView({ id, data }: NodeProps<TransposeNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<TransposeData>) => updateNodeData(id, p);
  const fmt: ToTextRules = { ...TO_TEXT_DEFAULTS, ...data.fmt };
  const avail = r?.view.available ?? [];
  const nameOpts: [string, string][] = [
    ['', `the first column${avail[0] ? ` (${titleOf(avail[0])})` : ''}`],
    ['#', 'the row numbers'],
    ...avail.slice(1).map((c, k): [string, string] => [c.name, `${columnLetter(k + 1)} · ${titleOf(c)}`]),
  ];
  if (data.names && data.names !== '#' && !avail.some((c) => c.name === data.names)) nameOpts.push([data.names, `${data.names} (missing)`]);
  return (
    <div className="node node-transpose">
      <InPort label="table" port="dataset" id="in" title="A table, or a workbook (every sheet turned)" />
      <NodeOptions>
        <div className="grid2">
          <Field label="Names from" title="The column whose cells name the new columns (one per row), or the row numbers">
            <Select<string> value={data.names} options={nameOpts} onChange={(names) => set({ names })} />
          </Field>
          <Field label="First column" title="The old names of the columns: a first column of text, of the numbers in them (“400 nm” gives 400), or left out">
            <Select<TransposeData['head']>
              value={data.head}
              options={[
                ['text', 'the old names, as text'],
                ['number', 'the numbers in the old names'],
                ['none', 'left out'],
              ]}
              onChange={(head) => set({ head })}
            />
          </Field>
          {data.head !== 'none' && (
            <Field label="Its name" title="The name of that first column (empty: Name, or what the old names share, with their unit)">
              <TextInput value={data.headName ?? ''} placeholder="found from the names" onChange={(headName) => set({ headName: headName || undefined })} />
            </Field>
          )}
          <TextRules r={fmt} set={(p) => set({ fmt: { ...data.fmt, ...p } })} />
        </div>
        {preview(r)}
      </NodeOptions>
      <Outputs r={r} />
    </div>
  );
}

export function StackNodeView({ id, data }: NodeProps<StackNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<StackData>) => updateNodeData(id, p);
  const avail = r?.view.available ?? [];
  const xFrom = data.xFrom ?? 'one';
  return (
    <div className="node node-stack">
      <InPort label="table" port="dataset" id="in" title="A table, or a workbook (every sheet stacked)" />
      <NodeOptions>
        <div className="grid2">
          <Field label="Columns" title="The columns put one under the other: 2-6, B-F, names (empty: every Y)">
            <TextInput value={data.cols} placeholder="every Y" onChange={(cols) => set({ cols })} />
          </Field>
          <Field label="Their X" title="One column for all, the X on the left of each column, or the row number">
            <Select<NonNullable<StackData['xFrom']>>
              value={xFrom}
              options={[
                ['one', 'one for all'],
                ['left', 'the X on the left of each'],
                ['row', 'the row number'],
              ]}
              onChange={(v) => set({ xFrom: v === 'one' ? undefined : v })}
            />
          </Field>
          {xFrom === 'one' && (
            <Field label="X" title="The X of all the columns (empty: the designated X, else the first column)">
              <Select<string> value={data.x ?? ''} options={[['', 'the designated X'], ...avail.map((c, k): [string, string] => [c.name, `${columnLetter(k)} · ${titleOf(c)}`])]} onChange={(x) => set({ x: x || undefined })} />
            </Field>
          )}
          <Field label="Names as" title="The name of each column, kept as text, or as the number in it (“300 K” gives 300)">
            <Select<StackData['key']>
              value={data.key}
              options={[
                ['text', 'text'],
                ['number', 'the number in each name'],
              ]}
              onChange={(key) => set({ key })}
            />
          </Field>
          <Field label="Names column" title="The name of the column of the names (empty: Name, or what the names share, with their unit)">
            <TextInput value={data.keyName ?? ''} placeholder="found from the names" onChange={(keyName) => set({ keyName: keyName || undefined })} />
          </Field>
          <Field label="Values column" title="The name of the column of the values (empty: Value)">
            <TextInput value={data.valueName ?? ''} placeholder="Value" onChange={(valueName) => set({ valueName: valueName || undefined })} />
          </Field>
        </div>
        {preview(r)}
      </NodeOptions>
      <Outputs r={r} />
    </div>
  );
}
