// Fractional calculus and Fractional FFT: the data, the order(s) and the method, the graph with the ranges (the result
// below on the same X; the filtered curve over the data), the transform on its own axis, the outputs.
import type { NodeProps } from '@xyflow/react';
import type { FracData, FrftData } from '../engine/fracnodes.ts';
import type { FracNode, FrftNode } from '../types.ts';
import { Check, Field, InPort, NumInput, OutPort, Select, TextInput } from './ui.tsx';
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

export function FracNodeView({ id, data }: NodeProps<FracNode>) {
  const { r, names, set } = useNode<FracData>(id);
  const view = r?.view.region;
  return (
    <div className="node node-calculus">
      <InPort label="dataset" port="dataset" id="in" title="X and the Y columns (a voltammogram: the potential and the current)" />
      <NodeOptions>
        <XYFields data={data} set={set} names={names} avail={r?.view.available} />
        <div className="grid2">
          <Field label="Order(s)" title="α: negative an integral (−0.5 the semi-integral), positive a derivative (0.5 the semi-derivative), 1 the usual one; several: a curve each (e.g. −0.5, 0.5)">
            <TextInput value={data.orders} placeholder="−0.5" onChange={(orders) => set({ orders })} />
          </Field>
          <Field label="Definition" title="Riemann–Liouville (the usual; from the start of every range), Caputo (the values at the start left out: for initial-value problems), Grünwald–Letnikov (the limit of differences; X even), Weyl (in the Fourier domain: periodic data, the mean left out)">
            <Select<FracData['method']>
              value={data.method}
              options={[
                ['rl', 'Riemann–Liouville'],
                ['caputo', 'Caputo'],
                ['gl', 'Grünwald–Letnikov'],
                ['fourier', 'Weyl (Fourier)'],
              ]}
              onChange={(method) => set({ method })}
            />
          </Field>
          <Field label="Along" title="X is the time (the points in the order of X), or the rows are in time order and X is a potential swept at a scan rate (a cyclic voltammogram: both sweeps, the time from |ΔE| / rate)">
            <Select<FracData['along']>
              value={data.along}
              options={[
                ['x', 'X (the time)'],
                ['rows', 'the rows (X a potential)'],
              ]}
              onChange={(along) => set({ along })}
            />
          </Field>
          {data.along === 'rows' && (
            <Field label="Scan rate (V/s)">
              <NumInput className="short" min={0} value={data.rate} onChange={(rate) => set({ rate })} />
            </Field>
          )}
        </div>
        <Check label="electrochemistry: D from the plateau of the semi-integral" title="Convolution voltammetry (Oldham 1972; Bard and Faulkner, ch. 6): the semi-integral of the current of a diffusion-limited wave levels off at m_L = n F A c √D" value={data.semi} onChange={(semi) => set({ semi })} />
        {data.semi && (
          <div className="grid2">
            <Field label="n (electrons)">
              <NumInput className="tiny" min={1} step={1} value={data.electrons} onChange={(electrons) => set({ electrons })} />
            </Field>
            <Field label="Area (cm²)">
              <NumInput className="tiny" min={0} value={data.area} onChange={(area) => set({ area })} />
            </Field>
            <Field label="c (mM)">
              <NumInput className="tiny" min={0} value={data.conc} onChange={(conc) => set({ conc })} />
            </Field>
            <Field label="Current in">
              <Select<FracData['unit']> seg
                value={data.unit}
                options={[
                  ['A', 'A'],
                  ['mA', 'mA'],
                  ['µA', 'µA'],
                  ['nA', 'nA'],
                ]}
                onChange={(unit) => set({ unit })}
              />
            </Field>
          </div>
        )}
      </NodeOptions>
      <Report lines={r?.view.report} />
      {view && <RegionGraph data={data} set={set} view={view} height={380} rangeHint="Then drag on the graph: one range computed on its own, from its start (the lower terminal)" />}
      <OutPort label="dataset" port="dataset" title="X (the time too, from a potential), every Y and its fractional derivative or integral of every order" />
    </div>
  );
}

export function FrftNodeView({ id, data }: NodeProps<FrftNode>) {
  const { r, names, set } = useNode<FrftData>(id);
  const view = r?.view.region;
  return (
    <div className="node node-calculus">
      <InPort label="dataset" port="dataset" id="in" title="X (evenly spaced) and the Y columns (at most 2048 points in the range)" />
      <NodeOptions>
        <XYFields data={data} set={set} names={names} avail={r?.view.available} />
        <div className="grid2">
          <Field label="Mode" title="The transform of an order; the scan of the orders 0 … 2 (how gathered the signal is at each: a chirp gathers into a spike at one order); a filter in the fractional domain (a band of u taken out or kept, then back)">
            <Select<FrftData['mode']>
              value={data.mode}
              options={[
                ['transform', 'transform of an order'],
                ['scan', 'scan of the orders'],
                ['filter', 'filter in the fractional domain'],
              ]}
              onChange={(mode) => set({ mode })}
            />
          </Field>
          <Field label="Algorithm" title="Fast (Ozaktas et al. 1996): close to the continuous transform, a chirp gathers into a spike (the usual); discrete (Candan et al. 2000): unitary and exact (a = 1 the DFT), a chirp spreads more">
            <Select<'fast' | 'discrete'>
              value={data.method ?? 'fast'}
              options={[
                ['fast', 'fast (Ozaktas)'],
                ['discrete', 'discrete (Candan)'],
              ]}
              onChange={(method) => set({ method: method === 'fast' ? undefined : method })}
            />
          </Field>
          {(data.mode === 'transform' || (data.mode === 'filter' && !data.auto)) && (
            <Field label="Order a" title="0: the signal, 1: the Fourier transform (centred), 2: the signal reversed; between: a rotation of the time–frequency plane by a·90°">
              <NumInput className="short" step={0.01} value={data.order} onChange={(order) => set({ order })} />
            </Field>
          )}
          {data.mode === 'filter' && (
            <>
              <Field label="Band of u" title="From … to, in samples from the middle (empty: around the strongest point, ± the width)">
                <NumInput className="tiny" value={data.u1} placeholder="auto" onChange={(u1) => set({ u1 })} />
                <NumInput className="tiny" value={data.u2} placeholder="auto" onChange={(u2) => set({ u2 })} />
              </Field>
              <Field label="± width" title="The half width of the band around the strongest point (samples)">
                <NumInput className="tiny" min={0} step={1} value={data.width} onChange={(width) => set({ width: Math.max(0, Math.round(width)) })} />
              </Field>
              <Field label="The band">
                <Select<FrftData['keep']> seg
                  value={data.keep}
                  options={[
                    ['remove', 'taken out'],
                    ['keep', 'kept'],
                  ]}
                  onChange={(keep) => set({ keep })}
                />
              </Field>
            </>
          )}
        </div>
        {data.mode === 'filter' && <Check label="at the order that gathers the signal most" title="The order found by the scan (a chirp: where it is a spike, easy to take out)" value={data.auto} onChange={(auto) => set({ auto })} />}
        {data.mode === 'filter' && data.keep === 'remove' && <Check label="its mirror too (a real signal)" title="A real chirp is two, rising and falling: the second gathers at the order 2 − a and is taken out there too" value={data.both !== false} onChange={(both) => set({ both: both ? undefined : false })} />}
      </NodeOptions>
      <Report lines={r?.view.report} />
      {view && <RegionGraph data={data} set={set} view={view} height={data.mode === 'filter' ? 340 : 220} rangeHint="Then drag on the graph: the part transformed (the first range)" />}
      <Result r={r} />
      <OutPort label="dataset" port="dataset" title="The transform (u, |F^a|, Re, Im), the scan (order, concentration) or the filtered signal and what was taken out" />
    </div>
  );
}
