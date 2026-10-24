// Wavelet: the data, the mode (the continuous transform, the coherence of two columns, the multiresolution analysis,
// denoising, the peaks of a Ricker transform) and its options, the graph with the ranges (the data with the rebuilt or
// denoised curve or the peaks over it; the result below on the same X), the spectra on their own axis, the outputs.
import type { NodeProps } from '@xyflow/react';
import type { WaveletData } from '../engine/waveletnode.ts';
import { WAVELET_FILTERS } from '../engine/waveletFilters.ts';
import type { WaveletNode } from '../types.ts';
import { Check, Field, InPort, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { RegionGraph } from './RegionGraph.tsx';
import { XYFields } from './BaselineNode.tsx';
import { Result } from './SignalNodes.tsx';
import { useNode } from './useStatNode.ts';

const FAMILIES = Object.entries(WAVELET_FILTERS).map(([k, v]): [string, string] => [k, v.label]);

export function WaveletNodeView({ id, data }: NodeProps<WaveletNode>) {
  const { r, names, set } = useNode<WaveletData>(id);
  const view = r?.view.region;
  const m = data.mode;
  const continuous = m === 'cwt' || m === 'coherence';
  return (
    <div className="node node-calculus">
      <InPort label="dataset" port="dataset" id="in" title="X (evenly spaced) and the Y columns" />
      <NodeOptions>
        <XYFields data={data} set={set} names={names} avail={r?.view.available} />
        <div className="grid2">
          <Field label="Mode">
            <Select<WaveletData['mode']>
              value={m}
              title="The transform (the power at every time and period), the coherence of two signals, the multiresolution analysis (the signal as details of every scale and a smooth), denoising, the peaks of a Ricker transform"
              options={[
                ['cwt', 'continuous transform (CWT)'],
                ['coherence', 'wavelet coherence'],
                ['mra', 'multiresolution (MODWT)'],
                ['denoise', 'denoising'],
                ['peaks', 'peaks (CWT)'],
              ]}
              onChange={(mode) => set({ mode })}
            />
          </Field>
          {m === 'cwt' && (
            <Field label="Wavelet" title="Morlet (ω0 6: good in frequency, the usual), Paul (order 4: good in time), DOG (order 2 the Mexican hat: real, the shape of peaks)">
              <Select<WaveletData['mother']>
                value={data.mother}
                options={[
                  ['morlet', 'Morlet'],
                  ['paul', 'Paul'],
                  ['dog', 'DOG (Mexican hat)'],
                ]}
                onChange={(mother) => set({ mother, param: NaN })}
              />
              <NumInput className="tiny" value={data.param} placeholder={data.mother === 'morlet' ? 'ω0 6' : data.mother === 'paul' ? '4' : '2'} title="Morlet: ω0; Paul, DOG: the order" onChange={(param) => set({ param })} />
            </Field>
          )}
          {m === 'coherence' && (
            <Field label="With" title="The second signal: the coherence of every Y with it (Morlet)">
              <Select value={data.y2} options={[['', 'choose'], ...names.map((nm): [string, string] => [nm, nm])]} onChange={(y2) => set({ y2 })} />
            </Field>
          )}
          {continuous && (
            <>
              <Field label="Voices per octave" title="Scales per doubling of the period (12: fine; 4: coarse, fast)">
                <NumInput className="tiny" min={1} max={32} step={1} value={data.voices} onChange={(voices) => set({ voices: Math.round(voices) })} />
              </Field>
              <Field label="Periods" title="From … to, in the units of X (empty: from two steps of X to the length of the record)">
                <NumInput className="tiny" min={0} value={data.pMin} placeholder="auto" onChange={(pMin) => set({ pMin })} />
                <NumInput className="tiny" min={0} value={data.pMax} placeholder="auto" onChange={(pMax) => set({ pMax })} />
              </Field>
              <Field label="Band" title="The periods averaged over in the graph below (the power or the coherence over time); empty: all">
                <NumInput className="tiny" min={0} value={data.band1} placeholder="all" onChange={(band1) => set({ band1 })} />
                <NumInput className="tiny" min={0} value={data.band2} placeholder="all" onChange={(band2) => set({ band2 })} />
              </Field>
            </>
          )}
          {m === 'cwt' && (
            <Field label="Significance" title="Against red noise (the lag-1 autocorrelation of the data: geophysics, slow drifts) or white noise, at a level">
              <Select<WaveletData['noise']>
                value={data.noise}
                options={[
                  ['red', 'red noise'],
                  ['white', 'white noise'],
                ]}
                onChange={(noise) => set({ noise })}
              />
              <NumInput className="tiny" min={0.5} max={0.999} step={0.01} value={data.level} onChange={(level) => set({ level })} />
            </Field>
          )}
          {(m === 'mra' || m === 'denoise') && (
            <>
              <Field label="Wavelet" title="Daubechies (dbN: smoother with N), Symlets (nearly symmetric: less shift of the features), Coiflets">
                <Select value={data.wavelet} options={FAMILIES} onChange={(wavelet) => set({ wavelet })} />
              </Field>
              <Field label="Levels" title="The scales split off: level j holds what changes over about 2^j steps of X">
                <NumInput className="tiny" min={1} max={12} step={1} value={data.levels} onChange={(levels) => set({ levels: Math.round(levels) })} />
              </Field>
            </>
          )}
          {m === 'mra' && (
            <Field label="Rebuild from" title="The parts added up into the curve drawn over the data: D1 the finest … DJ, S the smooth (e.g. “D3-D5, S”: the noise of D1, D2 left out; “D1-D4”: the drift left out); empty: all (the data again)">
              <TextInput value={data.keep} placeholder="all" onChange={(keep) => set({ keep })} />
            </Field>
          )}
          {m === 'denoise' && (
            <>
              <Field label="Threshold" title="Universal (σ√(2 ln n): smooth, may flatten small features), SURE (by level, from the risk), Bayes (by level: keeps more detail)">
                <Select<WaveletData['rule']>
                  value={data.rule}
                  options={[
                    ['bayes', 'BayesShrink'],
                    ['sure', 'SURE'],
                    ['universal', 'universal'],
                  ]}
                  onChange={(rule) => set({ rule })}
                />
                <Select<WaveletData['thr']>
                  value={data.thr}
                  options={[
                    ['soft', 'soft'],
                    ['hard', 'hard'],
                  ]}
                  onChange={(thr) => set({ thr })}
                />
              </Field>
            </>
          )}
          {m === 'peaks' && (
            <>
              <Field label="Widths" title="The widths of the peaks looked for, from … to, in the units of X (empty: from one step to a tenth of the record)">
                <NumInput className="tiny" min={0} value={data.wMin} placeholder="auto" onChange={(wMin) => set({ wMin })} />
                <NumInput className="tiny" min={0} value={data.wMax} placeholder="auto" onChange={(wMax) => set({ wMax })} />
              </Field>
              <Field label="Signal / noise" title="A peak kept when its ridge stands so many times over the noise (the low percentile of the finest scale around it)">
                <NumInput className="tiny" min={0} step={0.5} value={data.minSnr} onChange={(minSnr) => set({ minSnr })} />
              </Field>
            </>
          )}
        </div>
        {m === 'denoise' && <Check label="the noise of every level" title="σ estimated at every level (coloured noise, more at some scales), else from the finest details" value={data.perLevel} onChange={(perLevel) => set({ perLevel })} />}
      </NodeOptions>
      {r?.view.report && (
        <div className="stat-report">
          {r.view.report.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {view && <RegionGraph data={data} set={set} view={view} height={continuous ? 300 : 340} rangeHint="Then drag on the graph: the part of the record analysed (the first range)" />}
      <Result r={r} />
      <OutPort label={m === 'peaks' ? 'peaks' : m === 'mra' ? 'parts' : m === 'denoise' ? 'denoised' : 'over time'} port="dataset" title={m === 'peaks' ? 'Every peak: its X and height' : m === 'mra' ? 'X, the details D1 … DJ, the smooth SJ and the rebuilt curve of every Y' : m === 'denoise' ? 'X, every Y denoised and what was removed' : 'X, the power (or coherence) over the band, the ridge period, the cone of influence'} />
      {continuous && <OutPort label="map" port="dataset" id="map" title="Time, period, power or coherence, its significance or phase, in the cone (1/0): to a Contour map (Y the period, log)" />}
      {continuous && <OutPort label="global" port="dataset" id="global" title="The period and the global spectrum with its significance (or the mean coherence): to a Plot" />}
      {m === 'mra' && <OutPort label="energy" port="dataset" id="energy" title="The share of the energy in every part" />}
      {m === 'denoise' && <OutPort label="thresholds" port="dataset" id="thresholds" title="The threshold and the noise σ of every level" />}
    </div>
  );
}
