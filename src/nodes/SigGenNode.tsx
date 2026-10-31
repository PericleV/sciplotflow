// Signal generator: what is made (a sum of components, the C–V of an ideal MOS capacitor, a circuit's impedance), its
// numbers, then the noise and the rest put on it; out, a table.
import { useMemo } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { useNodeResult } from '../engine/engine.ts';
import { COMPONENTS, newComponent, type CompKind, type CvSpec, type GenComponent, type NoiseSpec, type SigGenSpec } from '../engine/siggen.ts';
import { CV_MORE, type CvStruct } from '../engine/cv.ts';
import { EIS_CIRCUITS, paramUnit, parseCircuit, startParams } from '../engine/eis.ts';
import type { AppNode, SigGenData, SigGenNode } from '../types.ts';
import { CircuitEditor } from './EisNode.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { Result } from './SignalNodes.tsx';
import { Check, Field, NumInput, OutPort, SciInput, Select, TextInput } from './ui.tsx';
import { IC } from './iconProps.ts';

const GROUPS = ['Waveforms', 'Chirp', 'Peaks', 'Baseline'] as const;
const STRUCTS: [CvStruct, string][] = [
  ['mos', 'MOS capacitor'],
  ['pn', 'p–n junction'],
  ['schottky', 'Schottky diode'],
  ['varactor', 'varactor (SPICE junction)'],
  ['mim', 'MIM capacitor'],
  ['ferro', 'ferroelectric capacitor'],
  ['ms', 'semiconductor electrode (Mott–Schottky)'],
  ['gcs', 'double layer (Gouy–Chapman–Stern)'],
];
// a structure chosen: its usual sweep and unit
const STRUCT_SWEEP: Record<CvStruct, Partial<CvSpec>> = {
  mos: { vFrom: -10, vTo: 10, unit: 'pF' },
  pn: { vFrom: -10, vTo: 2, unit: 'pF' },
  schottky: { vFrom: -10, vTo: 0.5, unit: 'pF' },
  varactor: { vFrom: -10, vTo: 0.5, unit: 'pF' },
  mim: { vFrom: -10, vTo: 10, unit: 'pF' },
  ferro: { vFrom: -10, vTo: 10, unit: 'pF' },
  ms: { vFrom: -1, vTo: 1.5, unit: 'uF/cm2' },
  gcs: { vFrom: -0.5, vTo: 0.5, unit: 'uF/cm2' },
};

// one component: its kind, on or off, a column of its own, removed; its numbers and choices
function ComponentRow({ c, k, set, remove }: { c: GenComponent; k: number; set: (p: Partial<GenComponent>) => void; remove: () => void }) {
  const def = COMPONENTS[c.kind];
  return (
    <div className="mark-row">
      <span className="row wrap">
        <strong>{k + 1}</strong>
        <span>{def.label}</span>
        <Check label="on" value={!c.off} onChange={(on) => set({ off: on ? undefined : true })} />
        <Check label="own column" title="Also written as a column of its own" value={!!c.own} onChange={(own) => set({ own: own || undefined })} />
        <span className="grow" />
        <button className="nodrag ts-btn" title="Remove" onClick={remove}>
          <X {...IC} />
        </button>
      </span>
      <span className="row wrap">
        {def.params.map(([key, label]) => (
          <Field key={key} label={label}>
            <NumInput className="tiny" value={c.p[key] ?? NaN} onChange={(v) => set({ p: { ...c.p, [key]: v } })} />
          </Field>
        ))}
        {Object.entries(def.opts ?? {}).map(([key, opts]) => (
          <Select<string> key={key} value={c.opts?.[key] ?? opts[0][0]} options={opts} onChange={(v) => set({ opts: { ...c.opts, [key]: v } })} />
        ))}
        {c.kind === 'poly' && (
          <Field label="c₀, c₁, c₂ …" title="The coefficients of c₀ + c₁·x + c₂·x² + …">
            <TextInput value={c.coefs ?? ''} placeholder="0, 0.1" onChange={(coefs) => set({ coefs })} />
          </Field>
        )}
      </span>
    </div>
  );
}

export function SigGenNodeView({ id, data: d }: NodeProps<SigGenNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<SigGenData>) => updateNodeData(id, p);
  const setCv = (p: Partial<CvSpec>) => set({ cv: { ...d.cv, ...p } });
  const setNoise = (p: Partial<NoiseSpec>) => set({ noise: { ...d.noise, ...p } });
  const comps = d.components;
  const setComp = (k: number, p: Partial<GenComponent>) => set({ components: comps.map((c, j) => (j === k ? { ...c, ...p } : c)) });
  const add = (kind: CompKind) => set({ components: [...comps, newComponent(kind, `c${Date.now().toString(36)}`)] });
  // the circuit's values: those typed, else its defaults (as Equivalent circuit starts them)
  const parsed = useMemo(() => parseCircuit(d.eis.circuit), [d.eis.circuit]);
  const params = typeof parsed === 'string' ? [] : startParams(parsed.elems, parsed.tree, d.eis.params, null);
  const setParam = (name: string, value: number) => set({ eis: { ...d.eis, params: params.map((q) => (q.name === name ? { ...q, value } : q)) } });
  const eis = d.kind === 'eis';
  // (C–V: the structure, and its numbers not typed yet)
  const st = d.cv.struct ?? 'mos';
  const usesT = st !== 'varactor' && st !== 'mim' && st !== 'ferro';
  const more = <K extends keyof typeof CV_MORE>(k: K) => (d.cv[k] ?? CV_MORE[k]) as NonNullable<CvSpec[K]>;
  const cols = r?.view.available ?? [];
  return (
    <div className="node node-siggen">
      <NodeOptions>
        <details open>
          <summary>Signal</summary>
          <div className="col-form">
            <span>Make</span>
            <Select<SigGenSpec['kind']>
              value={d.kind}
              options={[
                ['components', 'a sum of components'],
                ['cv', 'C–V of a structure'],
                ['eis', 'the impedance of a circuit'],
              ]}
              onChange={(kind) => set({ kind })}
            />
            {d.kind === 'components' && (
              <>
                <span>X</span>
                <span className="row wrap">
                  <NumInput className="short" value={d.xFrom} title="From" onChange={(xFrom) => set({ xFrom: Number.isFinite(xFrom) ? xFrom : 0 })} />–
                  <NumInput className="short" value={d.xTo} title="To" onChange={(xTo) => set({ xTo: Number.isFinite(xTo) ? xTo : 10 })} />
                  <Field label="Points">
                    <NumInput className="short" min={2} step={100} value={d.points} onChange={(points) => set({ points: Math.max(2, Math.round(points) || 1000) })} />
                  </Field>
                </span>
                <span>Names</span>
                <span className="row wrap">
                  <TextInput value={d.xName} placeholder="x" title="The X column's name, with its unit" onChange={(xName) => set({ xName })} />
                  <TextInput value={d.yName} placeholder="Signal" title="The signal's name, with its unit" onChange={(yName) => set({ yName })} />
                </span>
              </>
            )}
          </div>
          {d.kind === 'components' && (
            <div className="mark-box">
              {comps.length > 0 && (
                <div className="mark-list">
                  {comps.map((c, k) => (
                    <ComponentRow key={c.id} c={c} k={k} set={(p) => setComp(k, p)} remove={() => set({ components: comps.filter((_, j) => j !== k) })} />
                  ))}
                </div>
              )}
              <span className="row wrap">
                <Select<string>
                  value=""
                  title="Every component is added to the others: waveforms, a chirp, peaks (Gaussian, Lorentzian, Voigt, Fano, two coupled oscillators), a baseline"
                  options={[['', '+ Add component…'], ...GROUPS.flatMap((g) => (Object.keys(COMPONENTS) as CompKind[]).filter((k) => COMPONENTS[k].group === g).map((k): [string, string] => [k, `${g}: ${COMPONENTS[k].label}`]))]}
                  onChange={(v) => v && add(v as CompKind)}
                />
              </span>
            </div>
          )}
          {d.kind === 'cv' && (
            <div className="col-form">
              <span>Structure</span>
              <Select<CvStruct>
                value={st}
                options={STRUCTS}
                onChange={(struct) => setCv({ struct, ...STRUCT_SWEEP[struct] })}
              />
              {(st === 'mos' || st === 'schottky' || st === 'ms') && (
                <>
                  <span>Semiconductor</span>
                  <span className="row wrap">
                    <Select<CvSpec['type']>
                      seg
                      value={d.cv.type}
                      options={[
                        ['n', 'n-type'],
                        ['p', 'p-type'],
                      ]}
                      onChange={(type) => setCv({ type })}
                    />
                    <Field label="Doping" title="The donors (n) or acceptors (p), cm⁻³">
                      <SciInput className="short" unit="cm⁻³" value={d.cv.dop} onChange={(dop) => setCv({ dop })} />
                    </Field>
                  </span>
                </>
              )}
              {st === 'pn' && (
                <>
                  <span>Junction</span>
                  <span className="row wrap">
                    <Select<NonNullable<CvSpec['profile']>>
                      seg
                      value={more('profile')}
                      options={[
                        ['abrupt', 'abrupt'],
                        ['graded', 'linearly graded'],
                      ]}
                      onChange={(profile) => setCv({ profile })}
                    />
                    {more('profile') === 'abrupt' ? (
                      <>
                        <Field label="N_A" title="The acceptors of the p side, cm⁻³ (one-sided: much more than N_D)">
                          <SciInput className="short" unit="cm⁻³" value={more('na')} onChange={(na) => setCv({ na })} />
                        </Field>
                        <Field label="N_D" title="The donors of the n side, cm⁻³">
                          <SciInput className="short" unit="cm⁻³" value={more('nd')} onChange={(nd) => setCv({ nd })} />
                        </Field>
                      </>
                    ) : (
                      <Field label="a cm⁻⁴" title="The gradient of the net doping, N_D − N_A = a·x">
                        <SciInput className="short" unit="cm⁻⁴" value={more('grad')} onChange={(grad) => setCv({ grad })} />
                      </Field>
                    )}
                  </span>
                  <span>Built-in V</span>
                  <span className="row wrap">
                    <Select<NonNullable<CvSpec['vbiFrom']>>
                      seg
                      value={more('vbiFrom')}
                      title="Computed: (kT/q)·ln(N_A·N_D/nᵢ²) (abrupt), (2kT/q)·ln(aW/2nᵢ) self-consistent (graded)"
                      options={[
                        ['computed', 'computed'],
                        ['typed', 'typed'],
                      ]}
                      onChange={(vbiFrom) => setCv({ vbiFrom })}
                    />
                    {more('vbiFrom') === 'typed' && (
                      <Field label="V_bi V">
                        <NumInput className="tiny" value={more('vbi')} onChange={(vbi) => setCv({ vbi })} />
                      </Field>
                    )}
                  </span>
                </>
              )}
              {st === 'schottky' && (
                <>
                  <span>Barrier</span>
                  <span className="row wrap">
                    <Select<NonNullable<CvSpec['barrierFrom']>>
                      seg
                      value={more('barrierFrom')}
                      title="Typed, or from the work functions by the Schottky–Mott rule: φm − χ (n), E_g − (φm − χ) (p)"
                      options={[
                        ['typed', 'typed'],
                        ['work', 'from the work functions'],
                      ]}
                      onChange={(barrierFrom) => setCv({ barrierFrom })}
                    />
                    {more('barrierFrom') === 'typed' ? (
                      <Field label="φ_B eV">
                        <NumInput className="tiny" value={more('phiB')} onChange={(phiB) => setCv({ phiB })} />
                      </Field>
                    ) : (
                      <>
                        <Field label="φm eV" title="The metal's work function">
                          <NumInput className="tiny" value={d.cv.phiM} onChange={(phiM) => setCv({ phiM })} />
                        </Field>
                        <Field label="χ eV" title="The semiconductor's electron affinity">
                          <NumInput className="tiny" value={d.cv.chi} onChange={(chi) => setCv({ chi })} />
                        </Field>
                      </>
                    )}
                  </span>
                </>
              )}
              {st === 'mos' && (
                <>
                  <span>Curve</span>
                  <span className="row wrap">
                    <Select<CvSpec['mode']>
                      value={d.cv.mode}
                      title="Deep depletion: the majority carriers only (no inversion layer: a wide band gap, or a fast sweep). Low frequency: the minority carriers and the interface traps follow (back to C_ox in inversion). High frequency: they do not (C stays at its minimum)"
                      options={[
                        ['deep', 'deep depletion (majority carriers)'],
                        ['lf', 'low frequency (quasi-static)'],
                        ['hf', 'high frequency'],
                        ['lfhf', 'low and high frequency'],
                      ]}
                      onChange={(mode) => setCv({ mode })}
                    />
                    {(d.cv.mode === 'hf' || d.cv.mode === 'lfhf') && (
                      <Select<NonNullable<CvSpec['hfMin']>>
                        value={more('hfMin')}
                        title="In strong inversion: C_s held at its value at 2φ_B (the depletion approximation, Sze), at 2.10|u_B| + 1.33 kT/q (CV_ideal.m), or exact (Lindner, Brews: the majority carriers respond on the equilibrium profile)"
                        options={[
                          ['sze', 'held at 2φ_B (Sze)'],
                          ['fit', 'held at 2.10|u_B| + 1.33 (CV_ideal.m)'],
                          ['exact', 'exact (Lindner, Brews)'],
                        ]}
                        onChange={(hfMin) => setCv({ hfMin })}
                      />
                    )}
                  </span>
                  <span>Oxide</span>
                  <span className="row wrap">
                    <Field label="t_ox nm">
                      <NumInput className="tiny" value={d.cv.tox} onChange={(tox) => setCv({ tox })} />
                    </Field>
                    <Field label="ε_ox">
                      <NumInput className="tiny" value={d.cv.epsOx} onChange={(epsOx) => setCv({ epsOx })} />
                    </Field>
                  </span>
                </>
              )}
              {st === 'varactor' && (
                <>
                  <span>SPICE</span>
                  <span className="row wrap">
                    <Field label="C_J0 pF" title="The capacitance at 0 V">
                      <NumInput className="tiny" value={more('cj0')} onChange={(cj0) => setCv({ cj0 })} />
                    </Field>
                    <Field label="V_J V" title="The junction potential">
                      <NumInput className="tiny" value={more('vj')} onChange={(vj) => setCv({ vj })} />
                    </Field>
                    <Field label="M" title="The grading coefficient: ½ abrupt, ⅓ linearly graded, above ½ hyperabrupt">
                      <NumInput className="tiny" value={more('mj')} onChange={(mj) => setCv({ mj })} />
                    </Field>
                    <Field label="F_C" title="Beyond F_C·V_J in forward bias, C goes on as a straight line (SPICE)">
                      <NumInput className="tiny" value={more('fc')} onChange={(fc) => setCv({ fc })} />
                    </Field>
                  </span>
                </>
              )}
              {st === 'mim' && (
                <>
                  <span>Insulator</span>
                  <span className="row wrap">
                    <Field label="ε">
                      <NumInput className="tiny" value={more('epsI')} onChange={(epsI) => setCv({ epsI })} />
                    </Field>
                    <Field label="t nm">
                      <NumInput className="tiny" value={more('tins')} onChange={(tins) => setCv({ tins })} />
                    </Field>
                    <Field label="α₁ ppm/V" title="C = C₀(1 + α₁V + α₂V²)">
                      <NumInput className="tiny" value={more('vcc1')} onChange={(vcc1) => setCv({ vcc1 })} />
                    </Field>
                    <Field label="α₂ ppm/V²">
                      <NumInput className="tiny" value={more('vcc2')} onChange={(vcc2) => setCv({ vcc2 })} />
                    </Field>
                  </span>
                </>
              )}
              {st === 'ferro' && (
                <>
                  <span>Ferroelectric</span>
                  <span className="row wrap">
                    <Field label="P_s µC/cm²" title="The saturation polarization">
                      <NumInput className="tiny" value={more('ps')} onChange={(ps) => setCv({ ps })} />
                    </Field>
                    <Field label="P_r µC/cm²" title="The remanent polarization (below P_s)">
                      <NumInput className="tiny" value={more('pr')} onChange={(pr) => setCv({ pr })} />
                    </Field>
                    <Field label="E_c kV/cm" title="The coercive field">
                      <NumInput className="tiny" value={more('ec')} onChange={(ec) => setCv({ ec })} />
                    </Field>
                    <Field label="t nm">
                      <NumInput className="tiny" value={more('tf')} onChange={(tf) => setCv({ tf })} />
                    </Field>
                    <Field label="ε_b" title="The background permittivity (the part that does not switch)">
                      <NumInput className="tiny" value={more('epsB')} onChange={(epsB) => setCv({ epsB })} />
                    </Field>
                  </span>
                </>
              )}
              {st === 'ms' && (
                <>
                  <span>Electrode</span>
                  <span className="row wrap">
                    <Field label="ε_s">
                      <NumInput className="tiny" value={d.cv.epsS} onChange={(epsS) => setCv({ epsS })} />
                    </Field>
                    <Field label="E_fb V" title="The flat-band potential, against the reference electrode">
                      <NumInput className="tiny" value={more('efb')} onChange={(efb) => setCv({ efb })} />
                    </Field>
                    <Field label="C_H µF/cm²" title="The Helmholtz layer, in series (0: none, the bare Mott–Schottky)">
                      <NumInput className="tiny" min={0} value={more('ch')} onChange={(ch) => setCv({ ch: Math.max(0, ch || 0) })} />
                    </Field>
                  </span>
                </>
              )}
              {st === 'gcs' && (
                <>
                  <span>Electrolyte</span>
                  <span className="row wrap">
                    <Field label="c mol/L" title="A symmetric z:z electrolyte">
                      <NumInput className="tiny" value={more('conc')} onChange={(conc) => setCv({ conc })} />
                    </Field>
                    <Field label="z">
                      <NumInput className="tiny" min={1} step={1} value={more('z')} onChange={(z) => setCv({ z })} />
                    </Field>
                    <Field label="ε_r" title="The solvent's permittivity (water at 25 °C: 78.49)">
                      <NumInput className="tiny" value={more('epsW')} onChange={(epsW) => setCv({ epsW })} />
                    </Field>
                  </span>
                  <span>Layers</span>
                  <span className="row wrap">
                    <Field label="C_H µF/cm²" title="The Stern (Helmholtz) layer, in series (0: none, Gouy–Chapman alone)">
                      <NumInput className="tiny" min={0} value={more('ch')} onChange={(ch) => setCv({ ch: Math.max(0, ch || 0) })} />
                    </Field>
                    <Field label="E_pzc V" title="The potential of zero charge">
                      <NumInput className="tiny" value={more('epzc')} onChange={(epzc) => setCv({ epzc })} />
                    </Field>
                  </span>
                </>
              )}
              {usesT && (
                <>
                  <span>Temperatures</span>
                  <TextInput value={d.cv.temps} placeholder="300" title="K, comma-separated: a curve each" onChange={(temps) => setCv({ temps })} />
                </>
              )}
              {(st === 'mos' || st === 'pn' || st === 'schottky') && (
                <>
                  <span>Material</span>
                  <span className="row wrap">
                    <Field label="ε_s">
                      <NumInput className="tiny" value={d.cv.epsS} onChange={(epsS) => setCv({ epsS })} />
                    </Field>
                    <Field label="E_g eV">
                      <NumInput className="tiny" value={d.cv.eg} onChange={(eg) => setCv({ eg })} />
                    </Field>
                    <Select<NonNullable<CvSpec['niFrom']>>
                      seg
                      value={more('niFrom')}
                      title="nᵢ = √(N_c·N_v)·e^(−E_g/2kT), the densities of states from the effective masses; or typed (the same at every temperature)"
                      options={[
                        ['masses', 'nᵢ from the masses'],
                        ['typed', 'nᵢ typed'],
                      ]}
                      onChange={(niFrom) => setCv({ niFrom })}
                    />
                    {more('niFrom') === 'typed' ? (
                      <Field label="nᵢ cm⁻³">
                        <SciInput className="short" unit="cm⁻³" value={more('ni')} onChange={(ni) => setCv({ ni })} />
                      </Field>
                    ) : null}
                    {(more('niFrom') === 'masses' || st === 'schottky') && (
                      <>
                        <Field label="m_c*" title="The effective mass of the conduction band's density of states, in mₑ">
                          <NumInput className="tiny" value={d.cv.mc} onChange={(mc) => setCv({ mc })} />
                        </Field>
                        <Field label="m_v*" title="The effective mass of the valence band's density of states, in mₑ">
                          <NumInput className="tiny" value={d.cv.mv} onChange={(mv) => setCv({ mv })} />
                        </Field>
                      </>
                    )}
                  </span>
                </>
              )}
              {st === 'mos' && (
                <>
                  <span>Flat band</span>
                  <span className="row wrap">
                    <Select<CvSpec['vfbFrom']>
                      seg
                      value={d.cv.vfbFrom}
                      options={[
                        ['typed', 'typed'],
                        ['work', 'from the work functions'],
                      ]}
                      onChange={(vfbFrom) => setCv({ vfbFrom })}
                    />
                    {d.cv.vfbFrom === 'typed' ? (
                      <Field label="V_FB V">
                        <NumInput className="tiny" value={d.cv.vfb} onChange={(vfb) => setCv({ vfb })} />
                      </Field>
                    ) : (
                      <>
                        <Field label="φm eV" title="The metal's work function">
                          <NumInput className="tiny" value={d.cv.phiM} onChange={(phiM) => setCv({ phiM })} />
                        </Field>
                        <Field label="χ eV" title="The semiconductor's electron affinity">
                          <NumInput className="tiny" value={d.cv.chi} onChange={(chi) => setCv({ chi })} />
                        </Field>
                        <Field label="N_ox cm⁻²" title="A fixed charge in the oxide (positive: + charges), at its interface">
                          <NumInput className="tiny" value={d.cv.nox} onChange={(nox) => setCv({ nox: Number.isFinite(nox) ? nox : 0 })} />
                        </Field>
                      </>
                    )}
                  </span>
                  <span>Interface traps</span>
                  <span className="row wrap">
                    <Select<NonNullable<CvSpec['ditShape']>>
                      value={more('ditShape')}
                      title="Donors below mid-gap, acceptors above (neutral at mid-gap): their charge stretches the curve (and moves the flat band); at low frequency their capacitance adds to the semiconductor's"
                      options={[
                        ['none', 'none'],
                        ['const', 'constant over the gap'],
                        ['u', 'U-shaped'],
                      ]}
                      onChange={(ditShape) => setCv({ ditShape })}
                    />
                    {more('ditShape') !== 'none' && (
                      <Field label="D_it cm⁻²eV⁻¹" title={more('ditShape') === 'u' ? 'At mid-gap' : undefined}>
                        <SciInput className="short" unit="cm⁻² eV⁻¹" value={more('dit')} onChange={(dit) => setCv({ dit })} />
                      </Field>
                    )}
                    {more('ditShape') === 'u' && (
                      <>
                        <Field label="at the edges" title="More at the band edges: D_it + D_edge·(e^((E − E_c)/w) + e^((E_v − E)/w))">
                          <SciInput className="short" unit="cm⁻² eV⁻¹" value={more('ditEdge')} onChange={(ditEdge) => setCv({ ditEdge })} />
                        </Field>
                        <Field label="w eV">
                          <NumInput className="tiny" value={more('ditW')} onChange={(ditW) => setCv({ ditW })} />
                        </Field>
                      </>
                    )}
                  </span>
                </>
              )}
              <span>Area</span>
              <span className="row wrap">
                <Field label="mm²">
                  <NumInput className="tiny" value={d.cv.area} onChange={(area) => setCv({ area })} />
                </Field>
              </span>
              <span>{st === 'mos' ? 'Sweep V_G' : st === 'ms' || st === 'gcs' ? 'Sweep E' : 'Sweep V'}</span>
              <span className="row wrap">
                <NumInput className="tiny" value={d.cv.vFrom} onChange={(vFrom) => setCv({ vFrom })} />–
                <NumInput className="tiny" value={d.cv.vTo} onChange={(vTo) => setCv({ vTo })} />
                <Field label="Points">
                  <NumInput className="tiny" min={2} value={d.cv.points} onChange={(points) => setCv({ points: Math.max(2, Math.round(points) || 500) })} />
                </Field>
              </span>
              <span>Measured</span>
              <span className="row wrap">
                <Field label="R_s Ω" title="A series resistance (0: none); measured in parallel mode, C_m and G_m">
                  <NumInput className="tiny" min={0} value={more('rs')} onChange={(rs) => setCv({ rs: Math.max(0, rs || 0) })} />
                </Field>
                <Field label="G S" title="A leak across (0: none)">
                  <SciInput className="tiny" unit="S" value={more('gl')} onChange={(gl) => setCv({ gl: Math.max(0, gl || 0) })} />
                </Field>
                {(more('rs') > 0 || more('gl') > 0) && (
                  <Field label="f Hz">
                    <SciInput className="short" unit="Hz" value={more('freq')} onChange={(freq) => setCv({ freq })} />
                  </Field>
                )}
              </span>
              <span>Unit</span>
              <span className="row wrap">
                <Select<CvSpec['unit']>
                  value={d.cv.unit}
                  options={[
                    ['pF', 'pF'],
                    ['nF', 'nF'],
                    ['F', 'F'],
                    ['nF/cm2', 'nF/cm² (per area)'],
                    ['uF/cm2', 'µF/cm² (per area)'],
                    ...(st === 'mos' || st === 'ms' ? [['norm', 'C/C_ox'] as [CvSpec['unit'], string]] : []),
                  ]}
                  onChange={(unit) => setCv({ unit })}
                />
                {(st === 'mos' || st === 'pn' || st === 'schottky' || st === 'varactor' || st === 'ms') && (
                  <>
                    <Check label="1/C²" title="Its column too (Mott–Schottky)" value={!!d.cv.inv2} onChange={(inv2) => setCv({ inv2: inv2 || undefined })} />
                    {st !== 'varactor' && <Check label="W" title="The depletion width ε_s·A/C_s, a column" value={!!d.cv.width} onChange={(width) => setCv({ width: width || undefined })} />}
                  </>
                )}
                {(st === 'mos' || st === 'ms') && <Check label="ψs too" title="The surface potential at every voltage, a column" value={!!d.cv.psi} onChange={(psi) => setCv({ psi: psi || undefined })} />}
                {st === 'gcs' && <Check label="φ_d and σ too" title="The diffuse layer's potential and the charge, columns" value={!!d.cv.psi} onChange={(psi) => setCv({ psi: psi || undefined })} />}
              </span>
            </div>
          )}
          {eis && (
            <>
              {/* (as in Equivalent circuit: a circuit chosen, its code typed, or drawn) */}
              <div className="row wrap">
                <Select<string> value={EIS_CIRCUITS.some(([c]) => c === d.eis.circuit.replace(/\s+/g, '')) ? d.eis.circuit.replace(/\s+/g, '') : ''} options={[['', 'custom (the code / the drawing)'], ...EIS_CIRCUITS]} onChange={(circuit) => circuit && set({ eis: { ...d.eis, circuit } })} />
                <Field label="Code" title="Boukamp’s code: elements in series one after another, ( ) a parallel group, [ ] a series group inside it: R(RQ), R(Q[RW]), R(RQ)(RQ); R, C, L, Q (CPE), W, Wo, Ws; numbers keep a name (R1(R3Q1)). A new element starts at a typical value">
                  <TextInput className="mono" value={d.eis.circuit} placeholder="R(RQ)" onChange={(circuit) => set({ eis: { ...d.eis, circuit } })} />
                </Field>
              </div>
              {typeof parsed === 'string' && d.eis.circuit.trim() && <div className="msg warn">{parsed}</div>}
              <CircuitEditor code={d.eis.circuit} onCode={(circuit) => set({ eis: { ...d.eis, circuit } })} />
              <div className="col-form">
                <span>Values</span>
                <span className="row wrap">
                  {params.map((q) => (
                    <Field key={q.name} label={`${q.name}${paramUnit(q.name) ? ` ${paramUnit(q.name)}` : ''}`}>
                      <SciInput className="short" unit={paramUnit(q.name)} value={q.value} onChange={(v) => setParam(q.name, Number.isFinite(v) ? v : q.value)} />
                    </Field>
                  ))}
                </span>
                <span>Frequencies</span>
                <span className="row wrap">
                  <SciInput className="short" unit="Hz" value={d.eis.fMin} onChange={(fMin) => set({ eis: { ...d.eis, fMin } })} />–
                  <SciInput className="short" unit="Hz" value={d.eis.fMax} onChange={(fMax) => set({ eis: { ...d.eis, fMax } })} />
                  <span className="muted">Hz</span>
                  <Field label="a decade">
                    <NumInput className="tiny" min={1} value={d.eis.per} onChange={(per) => set({ eis: { ...d.eis, per: Math.max(1, Math.round(per) || 10) } })} />
                  </Field>
                </span>
              </div>
            </>
          )}
        </details>
        <details open={d.noise.kind !== 'none' || !!d.drift || !!d.spikes || !!d.missing || !!d.jitter}>
          <summary>Noise and more</summary>
          <div className="col-form">
            <span>Noise</span>
            <span className="row wrap">
              <Select<NoiseSpec['kind']>
                value={d.noise.kind}
                options={[
                  ['none', 'none'],
                  ['white', 'white'],
                  ['pink', 'pink (1/f)'],
                  ['brown', 'brown (1/f²)'],
                ]}
                onChange={(kind) => setNoise({ kind })}
              />
              {d.noise.kind !== 'none' && (
                <>
                  <Select<NoiseSpec['dist']>
                    seg
                    value={d.noise.dist}
                    options={[
                      ['normal', 'normal'],
                      ['uniform', 'uniform'],
                    ]}
                    onChange={(dist) => setNoise({ dist })}
                  />
                  {eis ? (
                    <Field label="% of |Z|" title="The SD of the noise on Z′ and Z″, a part of |Z|">
                      <NumInput className="tiny" min={0} value={d.noise.sigma} onChange={(sigma) => setNoise({ sigma: Math.max(0, sigma || 0) })} />
                    </Field>
                  ) : (
                    <>
                      <Select<NoiseSpec['by']>
                        seg
                        value={d.noise.by}
                        options={[
                          ['snr', 'SNR'],
                          ['sigma', 'SD'],
                        ]}
                        onChange={(by) => setNoise({ by })}
                      />
                      {d.noise.by === 'snr' ? (
                        <Field label="dB" title="The signal's power over the noise's (20 dB: the noise's SD a tenth of the signal's rms)">
                          <NumInput className="tiny" value={d.noise.snr} onChange={(snr) => setNoise({ snr: Number.isFinite(snr) ? snr : 20 })} />
                        </Field>
                      ) : (
                        <Field label="SD">
                          <NumInput className="tiny" min={0} value={d.noise.sigma} onChange={(sigma) => setNoise({ sigma: Math.max(0, sigma || 0) })} />
                        </Field>
                      )}
                    </>
                  )}
                </>
              )}
            </span>
            <span>Drift</span>
            <Field label="per unit of x" title="A straight drift added: so much more at every unit of x">
              <NumInput className="tiny" value={d.drift ?? 0} onChange={(drift) => set({ drift: drift || undefined })} />
            </Field>
            <span>Spikes</span>
            <span className="row wrap">
              <Field label="How many">
                <NumInput className="tiny" min={0} step={1} value={d.spikes ?? 0} onChange={(spikes) => set({ spikes: spikes > 0 ? Math.round(spikes) : undefined })} />
              </Field>
              {!!d.spikes && (
                <Field label="Size" title="A part of the signal's span">
                  <NumInput className="tiny" min={0} step={0.1} value={d.spikeSize ?? 0.5} onChange={(spikeSize) => set({ spikeSize })} />
                </Field>
              )}
            </span>
            <span>Missing</span>
            <Field label="% of the points" title="Points left empty, at random">
              <NumInput className="tiny" min={0} max={90} value={d.missing ?? 0} onChange={(missing) => set({ missing: missing > 0 ? Math.min(90, missing) : undefined })} />
            </Field>
            {d.kind === 'components' && (
              <>
                <span>Uneven</span>
                <Field label="Jitter" title="Every x moved at random by up to this part of the step (uneven sampling: for Lomb–Scargle)">
                  <NumInput className="tiny" min={0} max={1} step={0.1} value={d.jitter ?? 0} onChange={(jitter) => set({ jitter: jitter > 0 ? Math.min(1, jitter) : undefined })} />
                </Field>
              </>
            )}
            <span>Also</span>
            <span className="row wrap">
              <Check label="the clean signal" title="The signal without the noise, a column too" value={!!d.clean} onChange={(clean) => set({ clean: clean || undefined })} />
              <Field label="Seed" title="The same seed gives the same noise">
                <NumInput className="tiny" step={1} value={d.seed} onChange={(seed) => set({ seed: Number.isFinite(seed) ? Math.round(seed) : 1 })} />
              </Field>
            </span>
          </div>
        </details>
      </NodeOptions>
      <Result r={r}>{cols.length > 0 && <div className="hint">{`${cols.map((c) => c.name).slice(0, 5).join(', ')}${cols.length > 5 ? ' …' : ''}`}</div>}</Result>
      <OutPort label="dataset" port="dataset" id="out" title="The signal made: X, the signal (and its components, its clean copy)" />
    </div>
  );
}
