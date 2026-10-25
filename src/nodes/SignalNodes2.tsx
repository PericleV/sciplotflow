// Waveform measurements, Step detection, Event averaging: the data, the options, the graph with the ranges (the edges,
// the steps, the triggers marked on the data; the average on its own axis below) and the outputs.
import type { NodeProps } from '@xyflow/react';
import type { EventsData, StepsData, WaveformData } from '../engine/signal2nodes.ts';
import type { EventsNode, StepsNode, WaveformNode } from '../types.ts';
import { Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { RegionGraph } from './RegionGraph.tsx';
import { XYFields } from './BaselineNode.tsx';
import { Result } from './SignalNodes.tsx';
import { useNode } from './useStatNode.ts';

const Report = ({ lines }: { lines?: string[] }) =>
  lines?.length ? (
    <div className="stat-report">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  ) : null;

export function WaveformNodeView({ id, data }: NodeProps<WaveformNode>) {
  const { r, names, set } = useNode<WaveformData>(id);
  const view = r?.view.region;
  return (
    <div className="node node-calculus">
      <InPort label="dataset" port="dataset" id="in" title="A signal in time: X (the time) and the Y columns" />
      <NodeOptions>
        <XYFields data={data} set={set} names={names} avail={r?.view.available} />
        <div className="grid2">
          <Field label="Levels" title="The base and the top of the waveform: the modes of its histogram (IEEE 181: not moved by an overshoot or noise), its minimum and maximum, or given">
            <Select<WaveformData['levels']>
              value={data.levels}
              options={[
                ['histogram', 'histogram (IEEE 181)'],
                ['minmax', 'min and max'],
                ['given', 'given'],
              ]}
              onChange={(levels) => set({ levels })}
            />
          </Field>
          {data.levels === 'given' && (
            <Field label="Base, top">
              <NumInput className="tiny" value={data.base} onChange={(base) => set({ base })} />
              <NumInput className="tiny" value={data.top} onChange={(top) => set({ top })} />
            </Field>
          )}
          <Field label="Reference levels (%)" title="The low and high reference levels of the rise and fall times, in % of the amplitude (10–90 % or 20–80 %)">
            <NumInput className="tiny" min={0} max={50} value={data.lo} onChange={(lo) => set({ lo })} />
            <NumInput className="tiny" min={50} max={100} value={data.hi} onChange={(hi) => set({ hi })} />
          </Field>
          <Field label="Hysteresis (%)" title="An edge counted when the signal goes this far past the middle (in % of the amplitude): noise near the middle makes no edges">
            <NumInput className="tiny" min={0} max={40} value={data.hyst} onChange={(hyst) => set({ hyst })} />
          </Field>
          <Field label="Settling band (%)" title="Settled when it stays this near its level (in % of the amplitude) until the next edge">
            <NumInput className="tiny" min={0.1} max={20} step={0.5} value={data.tol} onChange={(tol) => set({ tol })} />
          </Field>
        </div>
      </NodeOptions>
      <Report lines={r?.view.report} />
      {view && <RegionGraph data={data} set={set} view={view} height={340} rangeHint="Then drag on the graph: one range measured on its own (a burst, a part of the record); the button turns off after it" />}
      <Messages result={r} />
      <OutPort label="measurements" port="dataset" title="Every Y (and range): base, top, amplitude, mean, RMS, peak to peak, crest factor, period, frequency, widths, duty cycle, rise and fall times, overshoot, settling" />
      <OutPort label="edges" port="dataset" id="edges" title="Every edge: its time, rise or fall time, overshoot, settling time, the time to the next edge" />
    </div>
  );
}

export function StepsNodeView({ id, data }: NodeProps<StepsNode>) {
  const { r, names, set } = useNode<StepsData>(id);
  const view = r?.view.region;
  return (
    <div className="node node-calculus">
      <InPort label="dataset" port="dataset" id="in" title="A signal in steps: X and the Y columns" />
      <NodeOptions>
        <XYFields data={data} set={set} names={names} avail={r?.view.available} />
        <div className="grid2">
          <Field label="A change of" title="The mean only (the noise the same throughout), or the mean and the noise (each level its own spread)">
            <Select<StepsData['cost']>
              value={data.cost}
              options={[
                ['mean', 'the mean'],
                ['meanvar', 'the mean and the noise'],
              ]}
              onChange={(cost) => set({ cost })}
            />
          </Field>
          <Field label="Method" title="PELT: the best segmentation for the penalty (exact, fast); binary segmentation: the best split again and again (or so many changes)">
            <Select<StepsData['method']>
              value={data.method}
              options={[
                ['pelt', 'PELT (exact)'],
                ['binseg', 'binary segmentation'],
              ]}
              onChange={(method) => set({ method })}
            />
          </Field>
          {!(data.method === 'binseg' && data.count > 0) && (
            <Field label="Penalty" title="What a change must gain to be kept. BIC (the usual), AIC (more changes), or a factor of your own (larger: fewer changes); scaled by the noise σ² found from the differences of neighbours">
              <Select<StepsData['penalty']> seg
                value={data.penalty}
                options={[
                  ['bic', 'BIC'],
                  ['aic', 'AIC'],
                  ['manual', 'a factor'],
                ]}
                onChange={(penalty) => set({ penalty })}
              />
              {data.penalty === 'manual' && <NumInput className="tiny" min={0} step={0.5} value={data.factor} onChange={(factor) => set({ factor })} />}
            </Field>
          )}
          {data.method === 'binseg' && (
            <Field label="Changes" title="So many changes (0: as many as the penalty lets)">
              <NumInput className="tiny" min={0} step={1} value={data.count} onChange={(count) => set({ count: Math.max(0, Math.round(count)) })} />
            </Field>
          )}
          <Field label="Least segment" title="The fewest points of a level">
            <NumInput className="tiny" min={1} step={1} value={data.minSize} onChange={(minSize) => set({ minSize: Math.max(1, Math.round(minSize)) })} />
          </Field>
        </div>
      </NodeOptions>
      <Report lines={r?.view.report} />
      {view && <RegionGraph data={data} set={set} view={view} height={340} />}
      <Messages result={r} />
      <OutPort label="segments" port="dataset" title="Every level: start, end, duration, mean, SD, points" />
      <OutPort label="steps" port="dataset" id="steps" title="Every change: where, the step size (to a Histogram), the dwell time before it" />
      <OutPort label="fit" port="dataset" id="fit" title="X, every Y and its step curve: to a Plot" />
    </div>
  );
}

export function EventsNodeView({ id, data }: NodeProps<EventsNode>) {
  const { r, names, set } = useNode<EventsData>(id);
  const view = r?.view.region;
  return (
    <div className="node node-calculus">
      <InPort label="dataset" port="dataset" id="in" title="A long record with repeated events: X (the time) and the Y columns" />
      <NodeOptions>
        <XYFields data={data} set={set} names={names} avail={r?.view.available} />
        <div className="grid2">
          <Field label="Trigger" title="Where every event starts: the signal crossing a level (rising or falling), the rows of a column of marks (a number other than 0, or a text), or times written">
            <Select<EventsData['trigger']>
              value={data.trigger}
              options={[
                ['rising', 'a level, rising'],
                ['falling', 'a level, falling'],
                ['column', 'a column of marks'],
                ['times', 'times written'],
              ]}
              onChange={(trigger) => set({ trigger })}
            />
          </Field>
          {(data.trigger === 'rising' || data.trigger === 'falling') && (
            <>
              <Field label="Level" title="The level crossed (empty: the middle of the range of the data)">
                <NumInput className="short" value={data.level} placeholder="auto" onChange={(level) => set({ level })} />
              </Field>
              <Field label="Dead time" title="The least time between two triggers (the next crossing within it ignored); empty: none">
                <NumInput className="short" min={0} value={data.gap} placeholder="none" onChange={(gap) => set({ gap })} />
              </Field>
            </>
          )}
          {data.trigger === 'column' && (
            <Field label="Marks">
              <Select value={data.markCol} options={[['', 'choose'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(markCol) => set({ markCol })} />
            </Field>
          )}
          {data.trigger === 'times' && (
            <Field label="Times">
              <TextInput value={data.times} placeholder="e.g. 1.2, 3.4, 5.6" onChange={(times) => set({ times })} />
            </Field>
          )}
          <Field label="Window" title="Before and after every trigger, in the units of X (empty: from the spacing of the triggers)">
            <NumInput className="tiny" min={0} value={data.before} placeholder="auto" onChange={(before) => set({ before })} />
            <NumInput className="tiny" min={0} value={data.after} placeholder="auto" onChange={(after) => set({ after })} />
          </Field>
          <Field label="Spread">
            <Select<EventsData['spread']> seg
              value={data.spread}
              options={[
                ['sd', 'SD'],
                ['se', 'SE'],
              ]}
              onChange={(spread) => set({ spread })}
            />
          </Field>
        </div>
        <Check label="every segment from its level before 0" title="The mean of every segment before the trigger taken off it: the slow drift does not blur the average" value={data.baseline} onChange={(baseline) => set({ baseline })} />
      </NodeOptions>
      <Report lines={r?.view.report} />
      {view && <RegionGraph data={data} set={set} view={view} height={260} rangeHint="Then drag on the graph: triggers looked for only inside the ranges" />}
      <Result r={r} />
      <OutPort label="average" port="dataset" title="Lag, the mean, SD or SE (±Y), N: to a Plot with error band" />
      <OutPort label="segments" port="dataset" id="segments" title="Lag and every segment: to a Plot (all of them over each other) or a Waterfall" />
      <OutPort label="triggers" port="dataset" id="triggers" title="Every event: its time, whether it was averaged" />
    </div>
  );
}
