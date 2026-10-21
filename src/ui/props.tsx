// The controls of the properties panels (Mantine): sections that remember being open, a row with its label, colour,
// opacity, sliders with their value, choices as pictures, the 3 × 3 anchor, angles, and numbers that show the value
// used when left empty (auto).
import { Accordion, ActionIcon, AngleSlider, ColorPicker, ColorSwatch, Group, NumberInput, Popover, SegmentedControl, Select, Slider, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { useContext, useRef, useState, type ReactNode } from 'react';
import { PageTextContext } from './pageText.ts';
import { Ban, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { FONTS, PALETTE, type TextStyle } from '../figure/spec.ts';

const round = (v: number, step: number) => {
  const d = Math.max(0, Math.min(4, -Math.floor(Math.log10(step || 1))));
  return +v.toFixed(d);
};

// ---- sections ----
const OPEN = 'graph-flow:prop-sections';
const readOpen = (panel: string, def: string[]): string[] => {
  try {
    const all = JSON.parse(localStorage.getItem(OPEN) ?? '{}') as Record<string, string[]>;
    return all[panel] ?? def;
  } catch {
    return def;
  }
};
const saveOpen = (panel: string, v: string[]) => {
  try {
    const all = JSON.parse(localStorage.getItem(OPEN) ?? '{}') as Record<string, string[]>;
    localStorage.setItem(OPEN, JSON.stringify({ ...all, [panel]: v }));
  } catch {
    // storage unavailable: open as at first
  }
};
// panel: what remembers the sections open (one key for every object of a kind); open: the ones open at first
export function Sections({ panel, open, children }: { panel: string; open: string[]; children: ReactNode }) {
  const [value, setValue] = useState(() => readOpen(panel, open));
  return (
    <Accordion multiple value={value} onChange={(v) => (setValue(v), saveOpen(panel, v))} chevronPosition="left" variant="default" className="props-sections">
      {children}
    </Accordion>
  );
}
export function Section({ value, title, icon, aside, children }: { value: string; title: string; icon?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <Accordion.Item value={value}>
      <Accordion.Control icon={icon}>
        <Group justify="space-between" wrap="nowrap" gap={6}>
          <span>{title}</span>
          {aside && <Text span size="xs" c="dimmed" truncate>{aside}</Text>}
        </Group>
      </Accordion.Control>
      <Accordion.Panel>{children}</Accordion.Panel>
    </Accordion.Item>
  );
}

// a label and its control; hint: said when the pointer rests on the label
export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const l = <span className={`prop-label${hint ? ' has-hint' : ''}`}>{label}</span>;
  return (
    <div className="prop-row">
      {hint ? <Tooltip label={hint} position="left">{l}</Tooltip> : l}
      <div className="prop-ctl">{children}</div>
    </div>
  );
}

// ---- colour ----
const RECENT = 'graph-flow:recent-colors';
const recentColors = (): string[] => {
  try {
    return (JSON.parse(localStorage.getItem(RECENT) ?? '[]') as string[]).slice(0, 8);
  } catch {
    return [];
  }
};
const keepRecent = (c: string) => {
  try {
    localStorage.setItem(RECENT, JSON.stringify([c, ...recentColors().filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 8)));
  } catch {
    // storage unavailable: nothing kept
  }
};
// value '' = none (none: allowed) or auto (auto: the colour then used, shown faded)
export function ColorField({ value, onChange, none, auto }: { value: string; onChange: (c: string) => void; none?: boolean; auto?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const shown = value || auto || '';
  // the colour last chosen, kept among the recent ones when the picker closes (not every step of a drag in it)
  const chosen = useRef('');
  const pick = (c: string) => {
    chosen.current = c;
    onChange(c);
    setDraft(c);
  };
  const done = () => {
    if (chosen.current) keepRecent(chosen.current);
    chosen.current = '';
    setOpen(false);
  };
  return (
    <Popover opened={open} onChange={(o) => (o ? setOpen(true) : done())} position="bottom-start" width={232} trapFocus>
      <Popover.Target>
        <UnstyledButton className="color-field" onClick={() => (open ? done() : (setDraft(value), setOpen(true)))} aria-label="Colour">
          {shown ? <ColorSwatch color={shown} size={18} radius="sm" style={{ opacity: value ? 1 : 0.55 }} /> : <span className="color-none"><Ban size={14} /></span>}
          <span className="color-name">{value ? value.toUpperCase() : auto ? 'auto' : 'none'}</span>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={10}>
        <Text size="xs" c="dimmed" mb={4}>Palette</Text>
        <div className="swatch-row">
          {PALETTE.map((c) => (
            <ColorSwatch key={c} component="button" color={c} size={20} radius="sm" className={value.toLowerCase() === c.toLowerCase() ? 'on' : ''} onClick={() => pick(c)} aria-label={c} />
          ))}
        </div>
        {recentColors().length > 0 && (
          <>
            <Text size="xs" c="dimmed" mt={8} mb={4}>Recent</Text>
            <div className="swatch-row">
              {recentColors().map((c) => (
                <ColorSwatch key={c} component="button" color={c} size={20} radius="sm" onClick={() => pick(c)} aria-label={c} />
              ))}
            </div>
          </>
        )}
        <Text size="xs" c="dimmed" mt={8} mb={4}>Other</Text>
        <ColorPicker size="sm" fullWidth format="hex" value={draft || shown || '#000000'} onChange={pick} />
        <Group mt={8} gap={6} wrap="nowrap">
          <TextInput className="grow" value={draft} placeholder={auto ?? 'none'} onChange={(e) => setDraft(e.currentTarget.value)} onBlur={() => /^#[0-9a-f]{6}$/i.test(draft) && pick(draft)} onKeyDown={(e) => e.key === 'Enter' && /^#[0-9a-f]{6}$/i.test(draft) && pick(draft)} />
          {(none || auto !== undefined) && (
            <Tooltip label={none ? 'No colour' : 'Back to auto'}>
              <ActionIcon variant="default" size="input-xs" onClick={() => (onChange(''), setDraft(''), setOpen(false))} aria-label={none ? 'No colour' : 'Back to auto'}>
                {none ? <Ban size={14} /> : <RotateCcw size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}

// ---- a value as a slider with its number beside it (a click on the number: typed in) ----
export function SliderField({ value, onChange, min, max, step, unit = '', marks, auto }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit?: string; marks?: number[]; auto?: boolean }) {
  const [typing, setTyping] = useState(false);
  return (
    <div className="slider-field">
      <Slider className="grow" value={Math.min(max, Math.max(min, value))} onChange={(v) => onChange(round(v, step))} min={min} max={max} step={step} marks={marks?.map((v) => ({ value: v }))} />
      {typing ? (
        <NumberInput
          className="slider-num"
          autoFocus
          hideControls
          value={value}
          step={step}
          onBlur={() => setTyping(false)}
          onKeyDown={(e) => e.key === 'Enter' && setTyping(false)}
          onChange={(v) => typeof v === 'number' && onChange(v)}
        />
      ) : (
        <UnstyledButton className={`slider-value${auto ? ' auto' : ''}`} onClick={() => setTyping(true)} title="Type a value">
          {+value.toFixed(3)}
          {unit && <span className="unit">{unit}</span>}
        </UnstyledButton>
      )}
    </div>
  );
}

// opacity, 0 … 1 kept, shown 0 … 100
export const OpacityField = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <SliderField value={Math.round(value * 100)} onChange={(v) => onChange(Math.max(0, Math.min(100, v)) / 100)} min={0} max={100} step={1} unit="%" />
);

// ---- choices ----
// a few choices side by side (words or pictures)
export function Choice<T extends string>({ value, onChange, options, full = true }: { value: T; onChange: (v: T) => void; options: [T, ReactNode, string?][]; full?: boolean }) {
  return (
    <SegmentedControl
      fullWidth={full}
      value={value}
      onChange={(v) => onChange(v as T)}
      data={options.map(([v, label, hint]) => ({ value: v, label: hint ? <Tooltip label={hint}><span className="seg-label">{label}</span></Tooltip> : <span className="seg-label">{label}</span> }))}
    />
  );
}

// many choices as a grid of pictures, each with its name on hover
export function PictureGrid<T extends string>({ value, onChange, options, cols = 5 }: { value: T; onChange: (v: T) => void; options: [T, ReactNode, string][]; cols?: number }) {
  return (
    <div className="pic-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {options.map(([v, pic, name]) => (
        <Tooltip key={v} label={name}>
          <UnstyledButton className={`pic${v === value ? ' on' : ''}`} onClick={() => onChange(v)} aria-label={name} aria-pressed={v === value}>
            {pic}
          </UnstyledButton>
        </Tooltip>
      ))}
    </div>
  );
}

// the same as a button showing the one chosen (its grid opens under it): where there is no room for all of them
export function PicturePick<T extends string>({ value, onChange, options, cols = 3, label }: { value: T; onChange: (v: T) => void; options: [T, ReactNode, string][]; cols?: number; label: string }) {
  const [open, setOpen] = useState(false);
  const cur = options.find(([v]) => v === value);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start">
      <Popover.Target>
        <Tooltip label={`${label}: ${cur?.[2] ?? ''}`} disabled={open}>
          <UnstyledButton className="pic-pick" onClick={() => setOpen(!open)} aria-label={label}>
            {cur?.[1]}
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path d="M1 2.5 L4 5.5 L7 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </UnstyledButton>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p={6}>
        <div className="pic-grid" style={{ gridTemplateColumns: `repeat(${cols}, 40px)` }}>
          {options.map(([v, pic, name]) => (
            <Tooltip key={v} label={name}>
              <UnstyledButton className={`pic${v === value ? ' on' : ''}`} onClick={() => (onChange(v), setOpen(false))} aria-label={name}>
                {pic}
              </UnstyledButton>
            </Tooltip>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

// a width in pt: the usual ones, or a slider for any
const WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
export function WidthField({ value, onChange, max = 6 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <>
      <div className="chip-row">
        {WIDTHS.map((w) => (
          <UnstyledButton key={w} className={`chip${w === value ? ' on' : ''}`} onClick={() => onChange(w)}>
            <svg width="14" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="14" y2="5" stroke="currentColor" strokeWidth={Math.min(w * 1.2, 4)} />
            </svg>
            {w}
          </UnstyledButton>
        ))}
      </div>
      <SliderField value={value} onChange={onChange} min={0} max={max} step={0.05} unit="pt" />
    </>
  );
}

// the point of a text or box at its place: 3 × 3
const ANCHORS = ['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br'] as const;
const ANCHOR_NAMES = ['top left', 'top middle', 'top right', 'middle left', 'centre', 'middle right', 'bottom left', 'bottom middle', 'bottom right'];
export function AnchorField<T extends string>({ value, onChange }: { value: T; onChange: (v: T) => void }) {
  return (
    <div className="anchor-grid" role="radiogroup" aria-label="Anchor">
      {ANCHORS.map((a, i) => (
        <Tooltip key={a} label={ANCHOR_NAMES[i]}>
          <UnstyledButton className={a === value ? 'on' : ''} onClick={() => onChange(a as unknown as T)} role="radio" aria-checked={a === value} aria-label={ANCHOR_NAMES[i]}>
            <i />
          </UnstyledButton>
        </Tooltip>
      ))}
    </div>
  );
}

// an angle in degrees (0: level; clockwise as on the figure): a dial, the usual ones, the number. The dial has its 0 at
// the top: turned a quarter, so that 0° points right as on the figure.
const signed = (a: number) => {
  const n = ((a % 360) + 360) % 360;
  return n > 180 ? n - 360 : n;
};
export function AngleField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const norm = ((value % 360) + 360) % 360;
  return (
    <div className="angle-field">
      <AngleSlider size={46} thumbSize={20} value={(norm + 90) % 360} onChange={(v) => onChange(signed(v - 90))} withLabel={false} step={1} />
      <div className="grow">
        <div className="chip-row">
          {[0, 45, 90, -45, -90, 180].map((a) => (
            <UnstyledButton key={a} className={`chip${a === value ? ' on' : ''}`} onClick={() => onChange(a)}>
              {a}°
            </UnstyledButton>
          ))}
        </div>
        <SliderField value={value} onChange={onChange} min={-180} max={180} step={1} unit="°" marks={[0]} />
      </div>
    </div>
  );
}

// a number left empty for auto: the value then used shown in grey (and “auto”), a typed one with ⟲ back to auto
export function AutoNumber({ value, auto, onChange, unit }: { value: number; auto: number | undefined; onChange: (v: number) => void; unit?: string }) {
  const own = Number.isFinite(value);
  return (
    <Group gap={6} wrap="nowrap">
      <NumberInput
        className="grow"
        value={own ? value : ''}
        placeholder={auto === undefined || !Number.isFinite(auto) ? '' : String(+auto.toPrecision(6))}
        onChange={(v) => onChange(typeof v === 'number' ? v : NaN)}
        rightSection={unit ? <Text size="xs" c="dimmed">{unit}</Text> : undefined}
        hideControls
      />
      {own ? (
        <Tooltip label={`Back to auto${auto !== undefined && Number.isFinite(auto) ? ` (${+auto.toPrecision(6)})` : ''}`}>
          <ActionIcon variant="default" size="input-xs" onClick={() => onChange(NaN)} aria-label="Back to auto">
            <RotateCcw size={14} />
          </ActionIcon>
        </Tooltip>
      ) : (
        <span className="auto-tag">auto</span>
      )}
    </Group>
  );
}

// ---- on / off ----
// a switch (a button: the app's label rules leave it alone), its words after it
export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <UnstyledButton className={`sw-toggle${value ? ' on' : ''}`} role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}>
      <span className="sw-track">
        <span className="sw-thumb" />
      </span>
      {label && <span className="sw-label">{label}</span>}
    </UnstyledButton>
  );
}

// ---- numbers typed ----
// a number (empty: NaN, as the app's own fields), its unit after it
export function NumField({ value, onChange, step, min, max, unit, prefix, placeholder }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; prefix?: string; placeholder?: string }) {
  return (
    <NumberInput
      className="num-field"
      value={Number.isFinite(value) ? +value.toPrecision(10) : ''}
      onChange={(v) => onChange(typeof v === 'number' ? v : v === '' || v === '-' ? NaN : Number(v))}
      step={step}
      min={min}
      max={max}
      clampBehavior="none"
      hideControls
      placeholder={placeholder}
      leftSection={prefix ? <Text size="xs" c="dimmed">{prefix}</Text> : undefined}
      leftSectionWidth={prefix ? 22 : undefined}
      rightSection={unit ? <Text size="xs" c="dimmed">{unit}</Text> : undefined}
      rightSectionWidth={unit ? 30 : undefined}
    />
  );
}
// two numbers side by side (x and y, from and to)
export function NumPair({ a, b, onA, onB, unit, names = ['x', 'y'] }: { a: number; b: number; onA: (v: number) => void; onB: (v: number) => void; unit?: string; names?: [string, string] }) {
  return (
    <div className="prop-pair">
      <NumField value={a} onChange={onA} prefix={names[0]} unit={unit} />
      <NumField value={b} onChange={onB} prefix={names[1]} unit={unit} />
    </div>
  );
}

// ---- texts ----
const SIZES = [6, 7, 8, 9, 10, 12, 14];
// a text's font, size, bold, italic, colour: empty = as the figure (its value shown when known)
export function TextStyleRows({ value, onChange }: { value: TextStyle | undefined; onChange: (v: TextStyle) => void }) {
  const page = useContext(PageTextContext);
  const v = value ?? {};
  // as TextStyleControls: the fields left empty taken away
  const set = (p: Partial<TextStyle>) => {
    const next: Record<string, unknown> = { ...v, ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '' || (typeof next[k] === 'number' && !Number.isFinite(next[k] as number))) delete next[k];
    onChange(next as TextStyle);
  };
  const nameOf = (f: string) => FONTS.find(([x]) => x === f)?.[1] ?? f.split(',')[0].replace(/'/g, '');
  const fonts: [string, string][] = FONTS.some(([f]) => f === v.font) || !v.font ? FONTS : [...FONTS, [v.font, nameOf(v.font)]];
  const cycle = (b: boolean | undefined) => (b === undefined ? true : b ? false : undefined);
  const state = (b: boolean | undefined) => (b === undefined ? 'auto' : b ? 'on' : 'off');
  const custom = v.size !== undefined && !SIZES.includes(v.size);
  return (
    <>
      <Row label="Font">
        <Select value={v.font ?? 'auto'} onChange={(f) => set({ font: !f || f === 'auto' ? undefined : f })} data={[{ value: 'auto', label: page ? `Auto (${nameOf(page.font)})` : 'Auto' }, ...fonts.map(([f, l]) => ({ value: f, label: l }))]} />
      </Row>
      <Row label="Size" hint="pt; auto: as the figure">
        <div className="chip-row">
          <UnstyledButton className={`chip${v.size === undefined ? ' on' : ' auto'}`} onClick={() => set({ size: undefined })}>
            auto{page ? ` ${page.size}` : ''}
          </UnstyledButton>
          {SIZES.map((s) => (
            <UnstyledButton key={s} className={`chip${v.size === s ? ' on' : ''}`} onClick={() => set({ size: s })}>
              {s}
            </UnstyledButton>
          ))}
          {custom && <UnstyledButton className="chip on">{v.size}</UnstyledButton>}
        </div>
        <SliderField value={v.size ?? page?.size ?? 8} auto={v.size === undefined} onChange={(size) => set({ size: size > 0 ? size : undefined })} min={1} max={36} step={0.5} unit="pt" />
      </Row>
      <Row label="Style" hint="Bold, italic: each auto (as the figure), on or off">
        <div className="toggle-row">
          <Tooltip label={`Bold: ${state(v.bold)} (click to change)`}>
            <UnstyledButton className={`toggle ${state(v.bold)}`} onClick={() => set({ bold: cycle(v.bold) })} aria-label="Bold">
              <b>B</b>
            </UnstyledButton>
          </Tooltip>
          <Tooltip label={`Italic: ${state(v.italic)} (click to change)`}>
            <UnstyledButton className={`toggle ${state(v.italic)}`} onClick={() => set({ italic: cycle(v.italic) })} aria-label="Italic">
              <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
            </UnstyledButton>
          </Tooltip>
        </div>
      </Row>
      <Row label="Colour">
        <ColorField value={v.color ?? ''} auto={page?.color ?? '#000000'} onChange={(color) => set({ color: color || undefined })} />
      </Row>
    </>
  );
}

// ---- shadows ----
// a shadow's look by its direction (0°: to the right, 90°: down), distance, softness, opacity and colour; kept as a move
// right and down (pt)
export type ShadowLook = { shadowX?: number; shadowY?: number; shadowBlur?: number; shadowColor?: string; shadowOpacity?: number };
export function ShadowRows({ v, def, set }: { v: ShadowLook; def: { x: number; y: number; blur: number; opacity: number }; set: (p: ShadowLook) => void }) {
  const [x, y] = [v.shadowX ?? def.x, v.shadowY ?? def.y];
  const dist = Math.hypot(x, y);
  const angle = dist ? +((Math.atan2(y, x) * 180) / Math.PI).toFixed(1) : 45;
  const move = (a: number, d: number) => set({ shadowX: +(d * Math.cos((a * Math.PI) / 180)).toFixed(3), shadowY: +(d * Math.sin((a * Math.PI) / 180)).toFixed(3) });
  return (
    <div className="prop-sub">
      <Row label="Direction" hint="Where the shadow falls: 0° to the right, 90° down, 180° to the left, -90° up">
        <AngleField value={angle} onChange={(a) => Number.isFinite(a) && move(a, dist || 1)} />
      </Row>
      <Row label="Distance" hint="How far the shadow is from it">
        <SliderField value={+dist.toFixed(2)} onChange={(d) => Number.isFinite(d) && move(angle, Math.max(0, d))} min={0} max={10} step={0.25} unit="pt" />
      </Row>
      <Row label="Softness" hint="How blurred the shadow is (0: sharp)">
        <SliderField value={v.shadowBlur ?? def.blur} onChange={(b) => set({ shadowBlur: Number.isFinite(b) ? Math.max(0, b) : undefined })} min={0} max={10} step={0.25} unit="pt" />
      </Row>
      <Row label="Opacity" hint="How dark the shadow is">
        <OpacityField value={v.shadowOpacity ?? def.opacity} onChange={(o) => set({ shadowOpacity: o })} />
      </Row>
      <Row label="Colour">
        <ColorField value={v.shadowColor ?? ''} auto="#000000" onChange={(c) => set({ shadowColor: c || undefined })} />
      </Row>
    </div>
  );
}

// ---- the layer ----
// z: below 0 under the data, the data at 0, higher numbers over lower ones (never 0)
export function LayerRow({ z, onChange }: { z: number; onChange: (z: number) => void }) {
  const step = (d: number) => {
    const n = z + d;
    onChange(n === 0 ? n + d : n);
  };
  return (
    <Row label="Layer" hint="Under the curves or over them; then which is on top: higher numbers over lower ones (the legend and every annotation, each on its own)">
      <Group gap={6} wrap="nowrap">
        <div className="grow">
          <Choice value={z < 0 ? 'under' : 'over'} onChange={(v) => onChange(v === 'under' ? -Math.abs(z) : Math.abs(z))} options={[['under', 'Under', 'Under the data (the curves)'], ['over', 'Over', 'Over the data']]} />
        </div>
        <Tooltip label="Back one step">
          <ActionIcon variant="default" size="input-xs" onClick={() => step(-1)} aria-label="Back one step">
            <ChevronDown size={14} />
          </ActionIcon>
        </Tooltip>
        <span className="layer-num">{z}</span>
        <Tooltip label="Forward one step">
          <ActionIcon variant="default" size="input-xs" onClick={() => step(1)} aria-label="Forward one step">
            <ChevronUp size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Row>
  );
}

// a slider for a value of its own, or the default (shown as “auto”, its value when known); ⟲ back to the default
export function AutoSlider({ value, def, onChange, min, max, step, unit }: { value: number | undefined; def: number | undefined; onChange: (v: number | undefined) => void; min: number; max: number; step: number; unit: string }) {
  return (
    <div className="auto-slider">
      <div className="grow">
        <SliderField value={value ?? def ?? min} auto={value === undefined} onChange={onChange} min={min} max={max} step={step} unit={unit} />
      </div>
      {value !== undefined ? (
        <Tooltip label="Back to auto">
          <ActionIcon variant="subtle" size="sm" onClick={() => onChange(undefined)} aria-label="Back to auto">
            <RotateCcw size={13} />
          </ActionIcon>
        </Tooltip>
      ) : (
        <span className="auto-tag">auto</span>
      )}
    </div>
  );
}

