// Values left out of a map (Contour, 3D stacked maps): below / above a threshold, equal to values written, and what
// the values outside the colour range become — two rows of a .col-form.
import type { HideSpec } from '../engine/hide.ts';
import { Field, NumInput, Select, TextInput } from './ui.tsx';

export function HideControls({ value, onChange }: { value: HideSpec | undefined; onChange: (h: HideSpec) => void }) {
  const h = value ?? {};
  const set = (p: Partial<HideSpec>) => onChange({ ...h, ...p });
  return (
    <>
      <span title="Values left out of the map (not drawn — or in the colour of missing values —, not in the colour range nor the levels): below / above a threshold, or equal to values written (−999, 0 …). The outputs keep them">Hide values</span>
      <span className="row wrap">
        <Field label="Below">
          <NumInput className="short" value={h.below ?? NaN} placeholder="none" onChange={(below) => set({ below: Number.isFinite(below) ? below : undefined })} />
        </Field>
        <Field label="Above">
          <NumInput className="short" value={h.above ?? NaN} placeholder="none" onChange={(above) => set({ above: Number.isFinite(above) ? above : undefined })} />
        </Field>
        <Field label="Equal to" title="A list: 0, -999">
          <TextInput className="short-text" value={h.values ?? ''} placeholder="none" onChange={(values) => set({ values })} />
        </Field>
      </span>
      <span title="The values outside the colour range: drawn in its end colours, or hidden">Outside the range</span>
      <Select<NonNullable<HideSpec['outside']>>
        value={h.outside ?? 'clamp'}
        options={[
          ['clamp', 'the end colours'],
          ['hide', 'hidden'],
        ]}
        onChange={(outside) => set({ outside })}
      />
    </>
  );
}
