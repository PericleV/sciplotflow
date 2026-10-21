// Phase diagram: a binary diagram computed from a thermodynamic model (two melting points and enthalpies of fusion,
// the interaction of the liquid and of the solid), the lever rule at points placed with the mouse or typed, an alloy
// cooled; out: the diagram, the amounts of the phases on cooling (figures) and their tables.
import { useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { PLOT_PAGE_DEFAULTS } from '../defaults.ts';
import type { AppNode, PageData, PhaseDiagramData, PhaseDiagramNode } from '../types.ts';
import { PHASE_PRESETS } from '../engine/phasenode.ts';
import { FigureView } from './FigureView.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { Check, Field, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { MousePointerClick, X } from 'lucide-react';
import { IC } from './iconProps.ts';

const K0 = 273.15;

export function PhaseNodeView({ id, data }: NodeProps<PhaseDiagramNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<PhaseDiagramData>) => updateNodeData(id, p);
  const [placing, setPlacing] = useState(false);
  const fig = r?.view.figure;
  const cool = r?.view.cooling;
  const page: PageData = { ...PLOT_PAGE_DEFAULTS, name: 'phase_diagram', ...data.page } as PageData;
  const cPage: PageData = { ...PLOT_PAGE_DEFAULTS, name: 'phase_amounts', ...data.coolingPage } as PageData;
  const tU = data.unit === 'C' ? '°C' : 'K';
  // a change of unit: every temperature written in the other
  const setUnit = (unit: PhaseDiagramData['unit']) => {
    if (unit === data.unit) return;
    const d = unit === 'K' ? K0 : -K0;
    const t = (v: number) => (Number.isFinite(v) ? +(v + d).toFixed(4) : v);
    set({ unit, tmA: t(data.tmA), tmB: t(data.tmB), tMin: t(data.tMin), tMax: t(data.tMax), points: data.points.map(([x, T]) => [x, t(T)]) });
  };
  const usePreset = (key: string) => {
    const p = PHASE_PRESETS.find((q) => q.key === key);
    if (!p) return set({ preset: undefined });
    const v = p.v;
    const toU = (T: number) => (data.unit === 'C' ? T : +(T + K0).toFixed(4));
    set({ preset: key, ...v, tmA: toU(v.tmA), tmB: toU(v.tmB), tMin: NaN, tMax: NaN });
  };
  const setPoint = (k: number, p: [number, number]) => set({ points: data.points.map((q, j) => (j === k ? p : q)) });
  const round = (p: [number, number]): [number, number] => [+p[0].toFixed(2), +p[1].toFixed(data.unit === 'C' ? 1 : 1)];
  const report = r?.view.report ?? [];
  return (
    <div className="node node-phase">
      <div className="row">
        <b>
          {data.a}–{data.b}
        </b>
        <span className="muted ellipsis">{PHASE_PRESETS.find((p) => p.key === data.preset)?.label ?? 'a model of your own'}</span>
      </div>
      {fig && (
        <FigureView
          fig={fig}
          width={460}
          page={page}
          setPage={(p) => set({ page: { ...data.page, ...p } })}
          layoutTitle=""
          {...(placing ? { place: { curve: '', sorted: false, points: data.points, onPoints: (pts: [number, number][]) => set({ points: pts.map(round) }) } } : {})}
        />
      )}
      <div className="row wrap">
        <button className={`nodrag${placing ? ' on' : ''}`} title="A click on the diagram adds a point (the lever rule there); drag a point to move it" onClick={() => setPlacing(!placing)}>
          <MousePointerClick {...IC} /> {placing ? 'Placing points: on' : 'Place points'}
        </button>
        {data.points.length > 0 && (
          <button className="nodrag" title="Take every point away" onClick={() => set({ points: [] })}>
            Clear points
          </button>
        )}
      </div>
      {report.length > 0 && (
        <div className="stat-report">
          {report.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      {cool && <FigureView fig={cool} width={460} page={cPage} setPage={(p) => set({ coolingPage: { ...data.coolingPage, ...p } })} layoutTitle="" />}
      <Messages result={r} />
      <OutPort label="figure" port="figure" id="figure" title="The phase diagram" />
      <OutPort label="cooling" port="figure" id="cooling" title="The amounts of the phases of the alloy against the temperature, stacked (when an alloy is chosen)" />
      <OutPort label="points" port="dataset" id="points" title="The lever rule at every point: its phases, their compositions and amounts" />
      <OutPort label="amounts" port="dataset" id="fractions" title="The alloy cooled: the temperature, the amount (%) and the composition of every phase" />
      <OutPort label="boundaries" port="dataset" id="boundaries" title="The liquidus, solidus and solvus lines (line, composition, temperature)" />
      <NodeOptions>
        <Field label="System" title="An example system (the melting points and enthalpies of fusion of the elements; the interactions chosen so the diagram looks like the real one: a teaching model)">
          <Select<string> value={data.preset ?? ''} options={[['', 'my own'], ...PHASE_PRESETS.map((p): [string, string] => [p.key, p.label])]} onChange={usePreset} />
        </Field>
        <div className="phase-grid">
          <span />
          <b>A</b>
          <b>B</b>
          <span title="The names of the two components (B: the composition axis, at% B)">Name</span>
          <TextInput className="short-text" value={data.a} onChange={(a) => set({ a, preset: undefined })} />
          <TextInput className="short-text" value={data.b} onChange={(b) => set({ b, preset: undefined })} />
          <span>Melting point ({tU})</span>
          <NumInput className="short" step={1} value={data.tmA} onChange={(tmA) => set({ tmA, preset: undefined })} />
          <NumInput className="short" step={1} value={data.tmB} onChange={(tmB) => set({ tmB, preset: undefined })} />
          <span title="The enthalpy of fusion of the pure component">ΔH fusion (kJ/mol)</span>
          <NumInput className="short" min={0} step={0.1} value={data.hA} onChange={(hA) => set({ hA, preset: undefined })} />
          <NumInput className="short" min={0} step={0.1} value={data.hB} onChange={(hB) => set({ hB, preset: undefined })} />
        </div>
        <div className="grid2">
          <Field label="Ω₀ liquid" title="The interaction in the liquid (kJ/mol): 0 ideal; > 0 the atoms prefer their own kind; < 0 they prefer to mix">
            <NumInput className="short" step={0.5} value={data.omegaL} onChange={(omegaL) => set({ omegaL, preset: undefined })} />
          </Field>
          <Field label="Ω₀ solid" title="The interaction in the solid (kJ/mol): 0 ideal (complete solubility); large and positive: a gap in the solid (two solids α and β), with the liquid a eutectic">
            <NumInput className="short" step={0.5} value={data.omegaS} onChange={(omegaS) => set({ omegaS, preset: undefined })} />
          </Field>
          <Field label="Ω₁ liquid" title="The asymmetry of the liquid (kJ/mol): Ω = Ω₀ + Ω₁ (1 − 2x), stronger on the side of A when positive">
            <NumInput className="short" step={0.5} value={data.omegaL1 ?? 0} onChange={(omegaL1) => set({ omegaL1, preset: undefined })} />
          </Field>
          <Field label="Ω₁ solid" title="The asymmetry of the solid (kJ/mol): a gap leaning to one side (one solid dissolving more than the other)">
            <NumInput className="short" step={0.5} value={data.omegaS1 ?? 0} onChange={(omegaS1) => set({ omegaS1, preset: undefined })} />
          </Field>
          <Field label="Unit" title="The temperatures in °C or K">
            <Select<PhaseDiagramData['unit']>
              value={data.unit}
              options={[
                ['C', '°C'],
                ['K', 'K'],
              ]}
              onChange={setUnit}
            />
          </Field>
          <Field label="Range" title={`The temperatures shown (${tU}; empty: automatic)`}>
            <span className="row">
              <NumInput className="short" value={data.tMin} placeholder="auto" onChange={(tMin) => set({ tMin })} />
              <NumInput className="short" value={data.tMax} placeholder="auto" onChange={(tMax) => set({ tMax })} />
            </span>
          </Field>
        </div>
        <div className="section-title">Lever rule</div>
        <div className="hint">Points: the composition (at% {data.b}) and the temperature; or Place points and click on the diagram.</div>
        {data.points.map((p, k) => (
          <div key={k} className="row">
            <b>{k + 1}</b>
            <NumInput className="short" min={0} max={100} step={1} value={p[0]} title={`at% ${data.b}`} onChange={(x) => setPoint(k, [x, p[1]])} />
            <NumInput className="short" step={5} value={p[1]} title={tU} onChange={(T) => setPoint(k, [p[0], T])} />
            <span className="muted">{tU}</span>
            <button className="nodrag ts-btn" title="Take this point away" onClick={() => set({ points: data.points.filter((_, j) => j !== k) })}>
              <X {...IC} />
            </button>
          </div>
        ))}
        <button className="nodrag" title="A point in the middle of the diagram (then move it)" onClick={() => set({ points: [...data.points, [50, +((data.tmA + data.tmB) / 2).toFixed(1)]] })}>
          + Point
        </button>
        <div className="section-title">Cooling an alloy</div>
        <Field label={`Alloy (at% ${data.b})`} title="An alloy cooled slowly (at equilibrium): a line down the diagram, the amounts of its phases against the temperature (the second figure); empty: none">
          <NumInput className="short" min={0} max={100} step={1} value={data.alloy} placeholder="none" onChange={(alloy) => set({ alloy })} />
        </Field>
        <Check label="Phase names in the regions" value={data.labels} onChange={(labels) => set({ labels })} />
        <Messages result={r} />
      </NodeOptions>
    </div>
  );
}
