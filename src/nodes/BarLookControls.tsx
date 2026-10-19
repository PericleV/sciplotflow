// The look of bars beyond their colour (Histogram, Bar chart): the hatching — its lines, colour, spacing, width —, the
// edge's line, rounded corners, a gradient, a shadow.
import { BAR_LOOK_DEFAULTS, type BarLook, type Dash, type Hatch } from '../figure/spec.ts';
import { DASHES, HATCHES } from './figureOptions.ts';
import { OptColor } from './fields.tsx';
import { HatchMore } from './HatchMore.tsx';
import { Check, Field, NumInput, Select } from './ui.tsx';

export function BarLookControls({ value, onChange }: { value: Partial<BarLook> | undefined; onChange: (v: Partial<BarLook>) => void }) {
  const v = { ...BAR_LOOK_DEFAULTS, ...value };
  const set = (p: Partial<BarLook>) => onChange({ ...value, ...p });
  return (
    <>
      <span>Hatching</span>
      <span className="row wrap">
        <Select<Hatch> value={v.hatch} options={HATCHES} onChange={(hatch) => set({ hatch })} />
        {v.hatch !== 'none' && (
          <>
            <input className="nodrag color" type="color" value={v.hatchColor || '#000000'} title="The colour of the hatching (else the edge's)" onChange={(e) => set({ hatchColor: e.target.value })} />
            <Field label="Every" title="The distance between its lines or marks, pt (a text: twice this)">
              <NumInput className="tiny" min={1} step={0.5} value={v.hatchSpacing} onChange={(hatchSpacing) => set({ hatchSpacing: Math.max(1, hatchSpacing || 4) })} />
            </Field>
            <Field label="Line" title="The width of its lines, pt">
              <NumInput className="tiny" min={0.1} step={0.1} value={v.hatchWidth} onChange={(hatchWidth) => set({ hatchWidth: Math.max(0.1, hatchWidth || 0.6) })} />
            </Field>
            <HatchMore h={v.hatch} look={v.hatchLook} spacing={false} onChange={(hatchLook) => set({ hatchLook })} />
          </>
        )}
      </span>
      <span>Bars</span>
      <span className="row wrap">
        <Select<Dash> value={v.edgeDash} options={DASHES} title="The line of the edge" onChange={(edgeDash) => set({ edgeDash })} />
        <Field label="Corners" title="Rounded corners: their radius, pt">
          <NumInput className="tiny" min={0} step={0.5} value={v.radius} onChange={(radius) => set({ radius: Math.max(0, radius || 0) })} />
        </Field>
        <Check label="Gradient" title="From one colour at the end of the bar to another at its base" value={v.gradient} onChange={(gradient) => set({ gradient })} />
        {v.gradient && (
          <>
            <OptColor value={v.gradTop} none="the bar's" title="At the end of the bar (the bar's own colour when not chosen)" onChange={(gradTop) => set({ gradTop })} />
            <span>→</span>
            <OptColor value={v.gradBase} none="lighter" title="At the base (a lighter one of the first when not chosen)" onChange={(gradBase) => set({ gradBase })} />
          </>
        )}
        <Check label="Shadow" value={v.shadow} onChange={(shadow) => set({ shadow })} />
      </span>
    </>
  );
}
