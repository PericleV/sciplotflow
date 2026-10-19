// The look of a border (a page, a Plot in a Merge, a legend, a text box): colour, width, line type, rounded corners,
// opacity — one row of controls, the same everywhere.
import type { Dash } from '../figure/spec.ts';
import { DASHES } from './figureOptions.ts';
import { NumInput, Select } from './ui.tsx';

export type BorderLook = { color: string; width: number; dash: Dash; radius: number; opacity: number };

export function BorderControls({ value: b, onChange, radius = true }: { value: BorderLook; onChange: (p: Partial<BorderLook>) => void; radius?: boolean }) {
  const num = (v: number, lo = 0) => Math.max(lo, Number.isFinite(v) ? v : 0);
  return (
    <span className="row wrap border-controls">
      <input className="nodrag color" type="color" value={b.color} title="Colour" onChange={(e) => onChange({ color: e.target.value })} />
      <NumInput className="tiny" min={0} step={0.25} value={b.width} title="Width, pt" onChange={(width) => onChange({ width: num(width) })} />
      <Select<Dash> value={b.dash} options={DASHES} title="Line" onChange={(dash) => onChange({ dash })} />
      {radius && <NumInput className="tiny" min={0} step={0.5} value={b.radius} title="Rounded corners: their radius, pt (0: square)" onChange={(r) => onChange({ radius: num(r) })} />}
      <NumInput className="tiny" min={0} max={1} step={0.05} value={b.opacity} title="Opacity (0 – 1)" onChange={(o) => onChange({ opacity: Math.min(1, num(o)) })} />
    </span>
  );
}
