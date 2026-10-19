// A hatching beyond its kind and colour, the same everywhere (bars and boxes, the fill under a curve, annotations, the
// ranges of a quick fit): its text (a text of one's own, at most 5 characters: letters, signs, emoji), then behind ⋯ its
// spacing, line, size, angle, opacity, background and staggered rows.
import { useState } from 'react';
import type { Hatch, HatchLook } from '../figure/spec.ts';
import { OptColor } from './fields.tsx';
import { Check, Field, NumInput, TextInput } from './ui.tsx';
import { Ellipsis } from 'lucide-react';
import { IC } from './iconProps.ts';

const MARKS: Hatch[] = ['.', 'o', 'squares', 'xs', 'text', 'dots2'];

// spacing: its spacing and line set here (false: the node has fields of its own for them)
export function HatchMore({ h, look, onChange, spacing = true }: { h: Hatch; look: HatchLook | undefined; onChange: (l: HatchLook | undefined) => void; spacing?: boolean }) {
  const [open, setOpen] = useState(false);
  if (h === 'none') return null;
  const v = look ?? {};
  // a value cleared: back to the default; nothing set: no look of its own
  const set = (p: Partial<HatchLook>) => {
    const next: HatchLook = { ...v, ...p };
    for (const k of Object.keys(next) as (keyof HatchLook)[]) if (next[k] === undefined || next[k] === '') delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <>
      {h === 'text' && <TextInput className="tiny-text" value={v.text ?? ''} placeholder="×" title="The text repeated: at most 5 characters (letters, signs, emoji — emoji may look different in Word / PowerPoint)" onChange={(text) => set({ text: [...text].slice(0, 5).join('') })} />}
      <button className={`nodrag ts-btn${open ? ' on' : ''}`} title="More of the hatching: spacing, line, size, angle, opacity, background, staggered rows" onClick={() => setOpen((o) => !o)}>
        <Ellipsis {...IC} />
      </button>
      {open && (
        <span className="row wrap hatch-more">
          <HatchLookFields h={h} look={look} onChange={onChange} spacing={spacing} />
        </span>
      )}
    </>
  );
}

// The fields of a hatching's look (in a row behind ⋯, or as a block of their own: the Figure Drawing editor).
export function HatchLookFields({ h, look, onChange, spacing = true }: { h: Hatch; look: HatchLook | undefined; onChange: (l: HatchLook | undefined) => void; spacing?: boolean }) {
  const v = look ?? {};
  const set = (p: Partial<HatchLook>) => {
    const next: HatchLook = { ...v, ...p };
    for (const k of Object.keys(next) as (keyof HatchLook)[]) if (next[k] === undefined || next[k] === '') delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const num = (x: number) => (Number.isFinite(x) && x > 0 ? x : undefined);
  const mark = MARKS.includes(h);
  return (
    <>
      {spacing && (
        <Field label="Every" title="The distance between its lines or marks, pt">
          <NumInput className="tiny" min={1} step={0.5} value={v.spacing ?? NaN} placeholder={h === 'text' ? '8' : '4'} onChange={(x) => set({ spacing: num(x) })} />
        </Field>
      )}
      {spacing && h !== 'text' && h !== 'checker' && (
        <Field label="Line" title="The width of its lines (the size of its dots), pt">
          <NumInput className="tiny" min={0.05} step={0.1} value={v.width ?? NaN} placeholder="0.6" onChange={(x) => set({ width: num(x) })} />
        </Field>
      )}
      {mark && (
        <Field label="Size" title="The size of its marks or of its text, pt (empty: from the spacing)">
          <NumInput className="tiny" min={0.1} step={0.5} value={v.size ?? NaN} placeholder="auto" onChange={(x) => set({ size: num(x) })} />
        </Field>
      )}
      <Field label="Angle" title="The hatching turned by this angle, degrees">
        <NumInput className="tiny" step={15} value={v.angle ?? NaN} placeholder="0" onChange={(x) => set({ angle: Number.isFinite(x) && x !== 0 ? x : undefined })} />
      </Field>
      <Field label="Opacity" title="Its opacity, 0 … 1">
        <NumInput className="tiny" min={0} max={1} step={0.1} value={v.opacity ?? NaN} placeholder="1" onChange={(x) => set({ opacity: Number.isFinite(x) && x < 1 ? Math.max(0, x) : undefined })} />
      </Field>
      <Field label="Background" title="A colour under the hatching (none: the fill shows through)">
        <OptColor value={v.bg ?? ''} none="none" onChange={(bg) => set({ bg: bg || undefined })} />
      </Field>
      {mark && h !== 'dots2' && <Check label="Staggered rows" title="Every other row of marks moved by half a step" value={!!v.stagger} onChange={(stagger) => set({ stagger: stagger || undefined })} />}
    </>
  );
}
