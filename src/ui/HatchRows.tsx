// A hatching's look in a properties panel, with sliders: its text (a text of its own), spacing, line, size of its marks,
// angle, opacity, background, staggered rows. The same fields and rules as HatchLookFields (nodes/HatchMore.tsx).
import { TextInput } from '@mantine/core';
import type { Hatch, HatchLook } from '../figure/spec.ts';
import { AngleField, AutoSlider, ColorField, OpacityField, Row, Toggle } from './props.tsx';

const MARKS: Hatch[] = ['.', 'o', 'squares', 'xs', 'text', 'dots2'];

export function HatchRows({ h, look, onChange, spacing = true }: { h: Hatch; look: HatchLook | undefined; onChange: (l: HatchLook | undefined) => void; spacing?: boolean }) {
  const v = look ?? {};
  // a value cleared: back to the default; nothing set: no look of its own
  const set = (p: Partial<HatchLook>) => {
    const next: HatchLook = { ...v, ...p };
    for (const k of Object.keys(next) as (keyof HatchLook)[]) if (next[k] === undefined || next[k] === '') delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const num = (x: number | undefined) => (x !== undefined && Number.isFinite(x) && x > 0 ? x : undefined);
  const mark = MARKS.includes(h);
  return (
    <div className="prop-sub">
      {h === 'text' && (
        <Row label="Its text" hint="The text repeated: at most 5 characters (letters, signs, emoji; emoji may look different in Word / PowerPoint)">
          <TextInput value={v.text ?? ''} placeholder="×" onChange={(e) => set({ text: [...e.currentTarget.value].slice(0, 5).join('') })} />
        </Row>
      )}
      {spacing && (
        <Row label="Spacing" hint="The distance between its lines or marks">
          <AutoSlider value={v.spacing} def={h === 'text' ? 8 : 4} onChange={(x) => set({ spacing: num(x) })} min={1} max={20} step={0.5} unit="pt" />
        </Row>
      )}
      {spacing && h !== 'text' && h !== 'checker' && (
        <Row label="Line" hint="The width of its lines (the size of its dots)">
          <AutoSlider value={v.width} def={0.6} onChange={(x) => set({ width: num(x) })} min={0.05} max={4} step={0.05} unit="pt" />
        </Row>
      )}
      {mark && (
        <Row label="Mark size" hint="The size of its marks or of its text (auto: from the spacing)">
          <AutoSlider value={v.size} def={undefined} onChange={(x) => set({ size: num(x) })} min={0.1} max={20} step={0.1} unit="pt" />
        </Row>
      )}
      <Row label="Angle" hint="The hatching turned by this angle">
        <AngleField value={v.angle ?? 0} onChange={(x) => set({ angle: Number.isFinite(x) && x !== 0 ? x : undefined })} />
      </Row>
      <Row label="Opacity">
        <OpacityField value={v.opacity ?? 1} onChange={(x) => set({ opacity: Number.isFinite(x) && x < 1 ? Math.max(0, x) : undefined })} />
      </Row>
      <Row label="Background" hint="A colour under the hatching (none: the fill shows through)">
        <ColorField value={v.bg ?? ''} none onChange={(bg) => set({ bg: bg || undefined })} />
      </Row>
      {mark && h !== 'dots2' && (
        <Row label="Staggered" hint="Every other row of marks moved by half a step">
          <Toggle value={!!v.stagger} onChange={(stagger) => set({ stagger: stagger || undefined })} />
        </Row>
      )}
    </div>
  );
}
