// The axes of a Plot: every side (scale, ticks, line, numbers, title), extra axes, the grid and the frame. The limits and
// the step left automatic show the values used (in grey, from the figure as drawn); a typed one has ⟲ back to auto.
import { useState } from 'react';
import { Button, Select as MSelect, TextInput as MTextInput, ActionIcon, Group, Tooltip, UnstyledButton } from '@mantine/core';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { AXIS_DEFAULTS, axisKind, axesStyle, type AxesStyle, type AxisSpec, type ExtraAxis, type GridStyle, type ProbAxis, type Side, type SideStyle } from '../figure/spec.ts';
import type { DrawnLimits } from '../figure/drawnLimits.ts';
import { RichInput, Tabs } from './fields.tsx';
import { AngleField, AutoNumber, Choice, ColorField, NumField, NumPair, OpacityField, PictureGrid, Row, Section, Sections, SliderField, TextStyleRows, Toggle, WidthField } from '../ui/props.tsx';
import { DASH_PICS } from '../ui/dashPics.tsx';
import { byNumber, freeOffset, removeAxis } from '../figure/multiAxes.ts';

// keys pressed in the panel are its own (an arrow key on a slider does not reach the canvas)
const ownKeys = (e: React.KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
};

// The breaks of an axis, one per row (from – to), as many as needed; stored as "20-80; 120-150".
function BreaksRows({ spec, set }: { spec: AxisSpec; set: (p: Partial<AxisSpec>) => void }) {
  const rows = (spec.breaks ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^\s*([-+]?[\d.eE+-]*?)\s*(?:-|–|to|\.\.)\s*([-+]?[\d.eE+-]*)\s*$/.exec(p);
      return m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
    });
  const write = (list: number[][]) => set({ breaks: list.map(([a, b]) => `${Number.isFinite(a) ? a : ''}-${Number.isFinite(b) ? b : ''}`).join('; ') });
  return (
    <>
      <Row label="Breaks" hint="Parts of the axis left out; the curves jump over them">
        {rows.map(([a, b], k) => (
          <Group key={k} gap={4} wrap="nowrap">
            <div className="grow">
              <NumPair a={a} b={b} names={['from', 'to']} onA={(v) => write(rows.map((r, j) => (j === k ? [v, r[1]] : r)))} onB={(v) => write(rows.map((r, j) => (j === k ? [r[0], v] : r)))} />
            </div>
            <Tooltip label="Remove this break">
              <ActionIcon variant="subtle" onClick={() => write(rows.filter((_, j) => j !== k))} aria-label="Remove this break">
                <X size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ))}
        <Button variant="default" leftSection={<Plus size={13} />} onClick={() => write([...rows, [NaN, NaN]])} style={{ alignSelf: 'flex-start' }}>
          Add a break
        </Button>
      </Row>
      {rows.length > 0 && (
        <Row label="Break gap" hint="The gap drawn at each break, % of the axis length">
          <SliderField value={spec.breakGap ?? 3} onChange={(v) => set({ breakGap: Math.max(0.5, v || 3) })} min={0.5} max={15} step={0.5} unit="%" />
        </Row>
      )}
    </>
  );
}

// dataKinds: the values can be numbers, categories or times (the bottom and left axes of a 1D plot)
// drawn: its limits and step as drawn (the values “auto” gives)
function ScaleRows({ spec, onChange, kinds = true, dataKinds = false, drawn }: { spec: AxisSpec; onChange: (s: AxisSpec) => void; kinds?: boolean; dataKinds?: boolean; drawn?: DrawnLimits }) {
  const set = (p: Partial<AxisSpec>) => onChange({ ...spec, ...p });
  const vk = spec.kind ?? 'auto';
  return (
    <>
      {dataKinds && (
        <Row label="Values" hint="What the values on this axis are: numbers; categories (a column of text, or numbers taken as names: every name at a place 1, 2, 3 …); dates and times (or durations, h:mm:ss). Automatic: categories for a column of text, dates or times when every text reads as one">
          <MSelect
            value={vk}
            onChange={(k) => k && set({ kind: k as NonNullable<AxisSpec['kind']> })}
            data={[
              { value: 'auto', label: 'Automatic' },
              { value: 'number', label: 'Numbers' },
              { value: 'category', label: 'Categories (names)' },
              { value: 'time', label: 'Dates and times' },
            ]}
          />
        </Row>
      )}
      {dataKinds && vk === 'category' && (
        <>
          <Row label="Order" hint="The names in the order they first come in the data, sorted, or in the order you write (the others after them)">
            <Choice<NonNullable<AxisSpec['catOrder']>>
              value={spec.catOrder ?? 'data'}
              onChange={(catOrder) => set({ catOrder })}
              options={[
                ['data', 'As data'],
                ['sorted', 'Sorted'],
                ['custom', 'As I write'],
              ]}
            />
          </Row>
          {spec.catOrder === 'custom' && (
            <Row label="Names" hint="The names in their order, separated by commas: B, A, C">
              <MTextInput value={spec.catList ?? ''} placeholder="e.g. Control, Low, High" onChange={(e) => set({ catList: e.currentTarget.value })} />
            </Row>
          )}
          <Row label="Spread" hint="Points of the same name spread across its place (scatter curves): ± this part of the distance between two names">
            <SliderField value={spec.jitter ?? 0} onChange={(v) => set({ jitter: Math.min(0.45, Math.max(0, v || 0)) || undefined })} min={0} max={0.45} step={0.01} />
          </Row>
        </>
      )}
      {dataKinds && (vk === 'time' || vk === 'auto') && (
        <>
          <Row label="Time labels" hint="Empty: automatic for the step of the ticks. Else written with: yyyy (2024), yy, MMMM (January), MMM (Jan), MM (01), M, dd (05), d, HH (13), H, mm, ss; a duration: H (all the hours), mm, ss; text in quotes: 'h'">
            <MTextInput value={spec.timeFormat ?? ''} placeholder="auto (e.g. dd.MM.yyyy)" onChange={(e) => set({ timeFormat: e.currentTarget.value || undefined })} />
          </Row>
          <Row label="Dates as" hint="How a date written with slashes is read when both ways could be (5/1/2024)">
            <Choice<NonNullable<AxisSpec['dateOrder']>>
              value={spec.dateOrder ?? 'dmy'}
              onChange={(dateOrder) => set({ dateOrder })}
              options={[
                ['dmy', 'Day / month'],
                ['mdy', 'Month / day'],
              ]}
            />
          </Row>
        </>
      )}
      <Row label="Start" hint="Empty: automatic (the value used is shown in grey)">
        <AutoNumber value={spec.min} auto={drawn?.lo} onChange={(min) => set({ min })} />
      </Row>
      <Row label="End" hint="Empty: automatic (the value used is shown in grey)">
        <AutoNumber value={spec.max} auto={drawn?.hi} onChange={(max) => set({ max })} />
      </Row>
      <Row label="Auto range" hint="How the automatic limits are chosen (when Start or End is empty): rounded out to the ticks, the data ± 5 %, or the data exactly">
        <Choice
          value={spec.range}
          onChange={(range) => set({ range })}
          options={[
            ['nice', 'Round'],
            ['padded', '± 5 %'],
            ['tight', 'Exact'],
          ]}
        />
      </Row>
      {kinds && (
        <Row label="Type">
          <MSelect
            value={spec.scale}
            onChange={(v) => v && set({ scale: v as AxisSpec['scale'] })}
            data={[
              { value: 'linear', label: 'Linear' },
              { value: 'log', label: 'Log' },
              { value: 'symlog', label: 'Symmetric log (through 0)' },
              { value: 'reciprocal', label: 'Reciprocal 1/x' },
              { value: 'probability', label: 'Probability (%)' },
              { value: 'logit', label: 'Logit (0 – 1)' },
            ]}
          />
        </Row>
      )}
      {kinds && spec.scale === 'log' && (
        <Row label="Base" hint="The ticks at the powers of this base (the axis is the same)">
          <Choice<string>
            value={String(spec.base ?? 10)}
            onChange={(b) => set({ base: b === '10' ? undefined : b === '2' ? 2 : 'e' })}
            options={[
              ['10', '10'],
              ['2', '2'],
              ['e', 'e'],
            ]}
          />
        </Row>
      )}
      {kinds && spec.scale === 'symlog' && (
        <Row label="Linear within ±" hint="Near 0 the axis is linear (from −this to +this), logarithmic beyond: for values of both signs over many decades">
          <NumField value={spec.linthresh ?? 1} min={0} onChange={(v) => set({ linthresh: v > 0 ? v : undefined })} />
        </Row>
      )}
      {kinds && spec.scale === 'probability' && (
        <Row label="Probability of" hint="Values in % (0 < v < 100), placed so that this distribution's cumulative probability is a straight line">
          <MSelect
            value={spec.prob ?? 'normal'}
            onChange={(v) => v && set({ prob: v as ProbAxis })}
            data={[
              { value: 'normal', label: 'Normal (Φ⁻¹)' },
              { value: 'logistic', label: 'Logistic (logit)' },
              { value: 'sev', label: 'Weibull: ln(−ln(1 − p))' },
              { value: 'lev', label: 'Gumbel: −ln(−ln p)' },
              { value: 'exp', label: 'Exponential: −ln(1 − p)' },
            ]}
          />
        </Row>
      )}
      <Row label="Reversed" hint="High values first">
        <Toggle value={spec.reverse} onChange={(reverse) => set({ reverse })} />
      </Row>
      {kinds && spec.scale !== 'reciprocal' && spec.scale !== 'probability' && <BreaksRows spec={spec} set={set} />}
    </>
  );
}

// The major ticks (where the numbers are) and the minor ones; their look.
function TickRows({ spec, onScale, s, set, drawn }: { spec: AxisSpec | null; onScale: (s: AxisSpec) => void; s: SideStyle; set: (p: Partial<SideStyle>) => void; drawn?: DrawnLimits }) {
  const num = (v: number, min = 0) => Math.max(min, Number.isFinite(v) ? v : min);
  const setScale = (p: Partial<AxisSpec>) => spec && onScale({ ...spec, ...p });
  const mode = spec?.ticksBy ?? 'auto';
  return (
    <>
      {spec && (
        <>
          <Row label="Numbers at" hint="Where the numbers are: automatic, every … (from …), a number of ticks over the whole axis, or at values you choose">
            <Choice
              value={mode}
              onChange={(ticksBy) => setScale({ ticksBy })}
              options={[
                ['auto', 'Auto'],
                ['increment', 'Every'],
                ['count', 'Count'],
                ['values', 'Values'],
              ]}
            />
            {mode === 'auto' && drawn && Number.isFinite(drawn.step) && <span className="prop-note">every {+drawn.step.toPrecision(6)} now</span>}
          </Row>
          {mode === 'increment' && (
            <>
              <Row label="Every" hint="The distance between two numbers, e.g. 5: 10, 15, 20 …">
                <AutoNumber value={spec.step} auto={drawn?.step} onChange={(step) => setScale({ step: step > 0 ? step : NaN })} />
              </Row>
              <Row label="Starting at" hint="The first number (empty: the multiples of the step, 0, 5, 10 …)">
                <AutoNumber value={spec.first ?? NaN} auto={undefined} onChange={(first) => setScale({ first })} />
              </Row>
            </>
          )}
          {mode === 'count' && (
            <Row label="Ticks" hint="This many major ticks, evenly from one end of the axis to the other">
              <SliderField value={Number.isFinite(spec.count) ? spec.count : 5} auto={!Number.isFinite(spec.count)} onChange={(count) => setScale({ count: count >= 2 ? Math.floor(count) : NaN })} min={2} max={20} step={1} />
            </Row>
          )}
          {mode === 'values' && (
            <Row label="At" hint="Values, with optional labels: 400, 532 = green, 633">
              <MTextInput value={spec.custom} placeholder="e.g. 400, 532 = green, 633" onChange={(e) => setScale({ custom: e.currentTarget.value })} />
            </Row>
          )}
          <Row label="Minor ticks" hint="Minor ticks between two major ones">
            <SliderField value={spec.minor} onChange={(minor) => setScale({ minor: Math.max(0, Math.min(9, Math.floor(minor) || 0)) })} min={0} max={9} step={1} />
          </Row>
          <Row label="Label every" hint="A number on every N-th major tick only (1: on all); the other ticks stay">
            <SliderField value={spec.labelEvery ?? 1} onChange={(v) => setScale({ labelEvery: Math.max(1, Math.floor(v) || 1) })} min={1} max={10} step={1} />
          </Row>
        </>
      )}
      <Row label="Show minor">
        <Toggle value={s.minorTicks} onChange={(minorTicks) => set({ minorTicks })} />
      </Row>
      <Row label="Direction">
        <Choice
          value={s.ticks}
          onChange={(ticks) => set({ ticks })}
          options={[
            ['in', 'In'],
            ['out', 'Out'],
            ['both', 'Both'],
            ['none', 'None'],
          ]}
        />
      </Row>
      <Row label="Major length">
        <SliderField value={s.tickLen} onChange={(v) => set({ tickLen: num(v) })} min={0} max={15} step={0.5} unit="pt" />
      </Row>
      <Row label="Minor length">
        <SliderField value={s.minorLen} onChange={(v) => set({ minorLen: num(v) })} min={0} max={15} step={0.5} unit="pt" />
      </Row>
      <Row label="Tick width">
        <WidthField value={s.tickWidth} onChange={(v) => set({ tickWidth: num(v) })} max={3} />
      </Row>
    </>
  );
}

const DECIMALS = [0, 1, 2, 3, 4, 5, 6];

function SideSections({ side, s, onChange, scale }: { side: Side | 'extra'; s: SideStyle; onChange: (s: SideStyle) => void; scale?: ReactScale }) {
  const set = (p: Partial<SideStyle>) => onChange({ ...s, ...p });
  const num = (v: number, min = 0) => Math.max(min, Number.isFinite(v) ? v : min);
  const along = side === 'left' ? -90 : side === 'right' ? 90 : 0;
  return (
    <Sections panel="axis-side" open={['scale', 'title']}>
      {scale && (
        <Section value="scale" title="Scale" aside={scale.drawn ? `${fmt(scale.drawn.lo)} – ${fmt(scale.drawn.hi)}` : undefined}>
          {scale.rows}
        </Section>
      )}
      <Section value="ticks" title="Ticks" aside={s.ticks === 'none' ? 'none' : s.ticks}>
        <TickRows spec={scale?.spec ?? null} onScale={scale?.onChange ?? (() => {})} s={s} set={set} drawn={scale?.drawn} />
      </Section>
      <Section value="line" title="Line" aside={s.line ? `${s.lineWidth} pt` : 'hidden'}>
        <Row label="Show">
          <Toggle value={s.line} onChange={(line) => set({ line })} />
        </Row>
        <Row label="Colour" hint="Of its line, ticks, numbers and title; or the colour of the first curve on this axis (several Y axes: which is whose)">
          <Toggle value={!!s.curveColor} onChange={(curveColor) => set({ curveColor: curveColor || undefined })} label="of its curve" />
          {!s.curveColor && <ColorField value={s.color} onChange={(color) => set({ color: color || '#000000' })} />}
        </Row>
        <Row label="Width">
          <WidthField value={s.lineWidth} onChange={(v) => set({ lineWidth: num(v) })} max={3} />
        </Row>
        <Row label="Offset" hint="The axis moved away from the frame (extra axes: side by side)">
          <SliderField value={s.offset} onChange={(v) => set({ offset: Number.isFinite(v) ? v : 0 })} min={0} max={100} step={1} unit="pt" />
        </Row>
        {side !== 'extra' && (
          <Row label="Cross at" hint={`The axis drawn where the other axis is at this value (${side === 'bottom' || side === 'top' ? 'a Y' : 'an X'}): its line, ticks and numbers there, its title at the frame's edge; 0 and 0 for axes through the origin; empty: at the frame's edge`}>
            <NumField value={s.cross ?? NaN} placeholder="the edge" onChange={(v) => set({ cross: Number.isFinite(v) ? v : undefined })} />
          </Row>
        )}
      </Section>
      <Section value="numbers" title="Numbers" aside={s.labels ? s.format : 'hidden'}>
        <Row label="Show" hint="The numbers (or names) at the ticks">
          <Toggle value={s.labels} onChange={(labels) => set({ labels })} />
        </Row>
        <Row label="Format">
          <MSelect
            value={s.format}
            onChange={(v) => v && set({ format: v as SideStyle['format'] })}
            data={[
              { value: 'auto', label: 'Automatic' },
              { value: 'decimal', label: 'Decimal' },
              { value: 'sci', label: 'Scientific' },
              { value: 'eng', label: 'Engineering' },
              { value: 'common', label: 'Common ×10ⁿ' },
              { value: 'percent', label: 'Percent' },
              { value: 'si', label: 'SI prefixes (k, M, µ, n)' },
            ]}
          />
        </Row>
        <Row label="Decimals" hint="auto: as many as the step needs">
          <div className="chip-row">
            <UnstyledButton className={`chip${Number.isFinite(s.decimals) ? ' auto' : ' on'}`} onClick={() => set({ decimals: NaN })}>
              auto
            </UnstyledButton>
            {DECIMALS.map((d) => (
              <UnstyledButton key={d} className={`chip${s.decimals === d ? ' on' : ''}`} onClick={() => set({ decimals: d })}>
                {d}
              </UnstyledButton>
            ))}
            {s.decimals > 6 && <UnstyledButton className="chip on">{s.decimals}</UnstyledButton>}
          </div>
        </Row>
        <Row label="Before, after" hint="A text before every number and after it">
          <div className="prop-pair">
            <MTextInput value={s.prefix} placeholder="before" onChange={(e) => set({ prefix: e.currentTarget.value })} />
            <MTextInput value={s.suffix} placeholder="after" onChange={(e) => set({ suffix: e.currentTarget.value })} />
          </div>
        </Row>
        <Row label="Divide by" hint="The numbers show value / factor (e.g. 1000: nm → µm)">
          <NumField value={s.factor} onChange={(v) => set({ factor: v && Number.isFinite(v) ? v : 1 })} />
        </Row>
        <Row label="Rotation" hint="45° or 90° for long names (the margin grows to fit)">
          <AngleField value={s.rotation} onChange={(v) => set({ rotation: Number.isFinite(v) ? v : 0 })} />
        </Row>
        <Row label="Wrap after" hint="Long names broken into lines of about this many characters, at their spaces (empty: one line)">
          <NumField value={s.wrap || NaN} min={1} placeholder="one line" unit="chars" onChange={(v) => set({ wrap: v >= 1 ? Math.floor(v) : undefined })} />
        </Row>
        <Row label="Gap" hint="Between the ticks and the numbers">
          <SliderField value={s.labelGap} onChange={(v) => set({ labelGap: Number.isFinite(v) ? v : 0 })} min={0} max={15} step={0.5} unit="pt" />
        </Row>
        <Row label="Also">
          <Toggle value={s.plus} onChange={(plus) => set({ plus })} label="+ on positive" />
          <Toggle value={s.hideFirst} onChange={(hideFirst) => set({ hideFirst })} label="hide the first" />
          <Toggle value={s.hideLast} onChange={(hideLast) => set({ hideLast })} label="hide the last" />
        </Row>
        <TextStyleRows value={s.labelText} onChange={(labelText) => set({ labelText })} />
      </Section>
      <Section value="title" title="Title" aside={s.showTitle ? undefined : 'hidden'}>
        <Row label="Show">
          <Toggle value={s.showTitle} onChange={(showTitle) => set({ showTitle })} />
        </Row>
        <Row label="Text" hint="Empty: from the data (the name of the column, with its unit: “Wavelength (nm)”)">
          <RichInput value={s.title} placeholder={side === 'bottom' || side === 'left' || side === 'extra' ? 'auto: the column’s name' : 'title'} onChange={(title) => set({ title })} />
        </Row>
        <TextStyleRows value={s.titleText} onChange={(titleText) => set({ titleText })} />
        <Row label="Rotation" hint="Auto: along the axis (bottom, top 0°; left −90°; right 90°); e.g. 0 for a Y title written level">
          <div className="chip-row">
            <UnstyledButton className={`chip${s.titleRotation === undefined ? ' on' : ' auto'}`} onClick={() => set({ titleRotation: undefined })}>
              along the axis
            </UnstyledButton>
          </div>
          <AngleField value={s.titleRotation ?? along} onChange={(v) => set({ titleRotation: Number.isFinite(v) ? v : undefined })} />
        </Row>
        <Row label="Gap" hint="Between the numbers and the title">
          <SliderField value={s.titleGap} onChange={(v) => set({ titleGap: Number.isFinite(v) ? v : 0 })} min={0} max={20} step={0.5} unit="pt" />
        </Row>
        <Row label="Position" hint="Along the axis: at its start, middle or end, or at a place (% of its length; or drag the title on the figure)">
          <Choice<SideStyle['titleAlign']>
            value={s.titleAlign ?? 'center'}
            onChange={(titleAlign) => set({ titleAlign, ...(titleAlign === 'custom' && s.titleAlign !== 'custom' ? { titleAt: s.titleAlign === 'start' ? 0 : s.titleAlign === 'end' ? 100 : 50 } : {}) })}
            options={
              side === 'left' || side === 'right'
                ? [
                    ['start', 'Bottom'],
                    ['center', 'Middle'],
                    ['end', 'Top'],
                    ['custom', 'At'],
                  ]
                : side === 'extra'
                  ? [
                      ['start', 'Start'],
                      ['center', 'Middle'],
                      ['end', 'End'],
                      ['custom', 'At'],
                    ]
                  : [
                      ['start', 'Left'],
                      ['center', 'Centre'],
                      ['end', 'Right'],
                      ['custom', 'At'],
                    ]
            }
          />
          {s.titleAlign === 'custom' && <SliderField value={s.titleAt} onChange={(v) => set({ titleAt: Math.min(100, Math.max(0, Number.isFinite(v) ? v : 50)) })} min={0} max={100} step={1} unit="%" marks={[50]} />}
        </Row>
      </Section>
    </Sections>
  );
}
// a side's scale, when it has one of its own: its rows, its spec (the ticks are set in Ticks), as drawn
type ReactScale = { rows: React.ReactNode; spec: AxisSpec; onChange: (s: AxisSpec) => void; drawn?: DrawnLimits };
const fmt = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(4)) : '');

function GridRows({ g, onChange }: { g: GridStyle; onChange: (g: GridStyle) => void }) {
  const set = (p: Partial<GridStyle>) => onChange({ ...g, ...p });
  return (
    <>
      <Row label="Lines at">
        <Toggle value={g.major} onChange={(major) => set({ major })} label="major ticks" />
        <Toggle value={g.minor} onChange={(minor) => set({ minor })} label="minor ticks" />
      </Row>
      {(g.major || g.minor) && (
        <>
          <Row label="Colour">
            <ColorField value={g.color} onChange={(color) => set({ color: color || '#c8c8c8' })} />
          </Row>
          <Row label="Minor colour">
            <ColorField value={g.minorColor} onChange={(minorColor) => set({ minorColor: minorColor || '#e4e4e4' })} />
          </Row>
          <Row label="Width">
            <WidthField value={g.width} onChange={(width) => set({ width: Math.max(0, width || 0) })} max={3} />
          </Row>
          <Row label="Style">
            <PictureGrid value={g.dash} onChange={(dash) => set({ dash })} options={DASH_PICS} cols={4} />
          </Row>
          <Row label="Opacity">
            <OpacityField value={g.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0, opacity || 0)) })} />
          </Row>
        </>
      )}
    </>
  );
}

const SIDES: [Side, string][] = [
  ['bottom', 'X1 bottom'],
  ['left', 'Y1 left'],
  ['top', 'X2 top'],
  ['right', 'Y2 right'],
];
const OPPOSITE: Record<Side, Side> = { bottom: 'top', top: 'bottom', left: 'right', right: 'left' };
// the next free id of an extra axis on a side: y3, y4 … or x3, x4 …
const nextAxisId = (extra: ExtraAxis[], side: Side) => {
  const k = axisKind(side);
  let n = 3;
  while (extra.some((e) => e.id === `${k}${n}`)) n++;
  return `${k}${n}`;
};

// dataKinds: the bottom and left axes can hold categories or times (a 1D plot)
// show: an axis double-clicked on the figure (its side or extra axis opened)
// limits: every axis's limits and step as drawn (by its side or id: what auto is)
export function AxesEditor({ value, onChange, dataKinds = false, show, limits }: { value: Partial<AxesStyle> | undefined; onChange: (s: AxesStyle) => void; dataKinds?: boolean; show?: { axis: string; seq: number }; limits?: Record<string, DrawnLimits> }) {
  const st = axesStyle(value);
  const set = (patch: Partial<AxesStyle>) => onChange({ ...st, ...patch });
  const [chosen, setTab] = useState<string>(show?.axis ?? 'bottom');
  const [seen, setSeen] = useState(show?.seq);
  if (show && show.seq !== seen) {
    setSeen(show.seq);
    setTab(show.axis);
  }
  // an added axis taken away meanwhile (its last curve moved): the bottom axis shown
  const tab = SIDES.some(([k]) => k === chosen) || chosen === 'grid' || st.extra.some((e) => e.id === chosen) ? chosen : 'bottom';
  const setSide = (k: Side, s: SideStyle) => set({ sides: { ...st.sides, [k]: s } });
  const extra = st.extra.find((e) => e.id === tab);
  const setExtra = (p: Partial<ExtraAxis>) => set({ extra: st.extra.map((e) => (e.id === tab ? { ...e, ...p } : e)) });
  const side = SIDES.some(([k]) => k === tab) ? (tab as Side) : null;
  const copySide = (from: Side, to: Side[]) => {
    const sides = { ...st.sides };
    // the look is copied; what is shown (numbers, title) and the title text stay
    for (const k of to) sides[k] = { ...st.sides[from], labels: st.sides[k].labels, showTitle: st.sides[k].showTitle, title: st.sides[k].title };
    set({ sides });
  };
  const addAxis = (s: Side) => {
    const nid = nextAxisId(st.extra, s);
    // out past the axes there, in the first place free
    const offset = freeOffset(st, s);
    set({ extra: [...st.extra, { id: nid, side: s, scale: AXIS_DEFAULTS, style: { ...st.sides[s === 'top' || s === 'bottom' ? 'bottom' : 'left'], labels: true, showTitle: true, title: '', offset } }] });
    setTab(nid);
  };
  const second = side === 'top' ? st.top : side === 'right' ? st.right : null;
  const setSecond = (p: Partial<AxesStyle['top']>) => (side === 'top' ? set({ top: { ...st.top, ...p } }) : set({ right: { ...st.right, ...p } }));
  // the scale of the side shown: the bottom's, the left's, an own top / right one, or none (a mirror)
  const sideScale = (): ReactScale | undefined => {
    if (!side) return undefined;
    if (!(side === 'bottom' || side === 'left' || (second && second.mode !== 'mirror'))) return undefined;
    const spec = side === 'bottom' ? st.x : side === 'left' ? st.y : second!.scale;
    const onSpec = (sp: AxisSpec) => (side === 'bottom' ? set({ x: sp }) : side === 'left' ? set({ y: sp }) : setSecond({ scale: sp }));
    const drawn = second && second.mode === 'function' ? undefined : limits?.[side];
    return { spec, onChange: onSpec, drawn, rows: <ScaleRows spec={spec} kinds={!(second && second.mode === 'function')} dataKinds={dataKinds && (side === 'bottom' || side === 'left')} onChange={onSpec} drawn={drawn} /> };
  };
  return (
    <div className="axes-editor props-panel props-embed nodrag" onKeyDown={ownKeys}>
      <Tabs tabs={[...SIDES, ...byNumber(st.extra).map((e): [string, string] => [e.id, `${e.id.toUpperCase()} ${e.side}`]), ['grid', 'Grid, frame']]} value={tab} onChange={setTab} />
      <div className="axes-add">
        <span className="prop-label">Add an axis</span>
        <Button variant="default" leftSection={<Plus size={13} />} title="Another Y axis on the right (a third Y), moved out from the frame" onClick={() => addAxis('right')}>
          Y right
        </Button>
        <Button variant="default" leftSection={<Plus size={13} />} title="Another Y axis on the left" onClick={() => addAxis('left')}>
          Y left
        </Button>
        <Button variant="default" leftSection={<Plus size={13} />} title="Another X axis on top" onClick={() => addAxis('top')}>
          X top
        </Button>
        <Button variant="default" leftSection={<Plus size={13} />} title="Another X axis at the bottom" onClick={() => addAxis('bottom')}>
          X bottom
        </Button>
      </div>
      {side && (
        <div className="axes-side">
          {second && (
            <div className="axes-head">
              <Row label="This axis" hint="A mirror of the opposite axis (same scale), its own scale (curves choose it in their style: X2 / Y2), or a function of the opposite axis">
                <Choice
                  value={second.mode}
                  onChange={(mode) => setSecond({ mode })}
                  options={[
                    ['mirror', 'Mirror', `A mirror of the ${OPPOSITE[side]} axis`],
                    ['own', 'Own scale'],
                    ['function', 'f(x)', `A function of the ${OPPOSITE[side]} axis`],
                  ]}
                />
              </Row>
              {second.mode === 'function' && (
                <Row label="Value = f(x)" hint="A formula of x, the value on the opposite axis: e.g. 1239.84/x for eV over nm, 1e7/x for cm⁻¹ over nm">
                  <MTextInput value={second.fn} placeholder="e.g. 1239.84/x" onChange={(e) => setSecond({ fn: e.currentTarget.value })} />
                </Row>
              )}
            </div>
          )}
          <SideSections key={side} side={side} s={st.sides[side]} onChange={(s) => setSide(side, s)} scale={sideScale()} />
          <div className="axes-copy">
            <span className="prop-label">Copy this look to</span>
            <Button variant="default" onClick={() => copySide(side, [OPPOSITE[side]])}>
              The {OPPOSITE[side]} axis
            </Button>
            <Button variant="default" onClick={() => copySide(side, SIDES.map(([k]) => k).filter((k) => k !== side))}>
              All four
            </Button>
          </div>
        </div>
      )}
      {extra && (
        <div className="axes-side">
          <div className="axes-head">
            <Row label="Side">
              <Group gap={6} wrap="nowrap">
                <div className="grow">
                  <Choice
                    value={extra.side}
                    onChange={(s) => setExtra({ side: s })}
                    options={
                      axisKind(extra.side) === 'y'
                        ? [
                            ['right', 'Right'],
                            ['left', 'Left'],
                          ]
                        : [
                            ['top', 'Top'],
                            ['bottom', 'Bottom'],
                          ]
                    }
                  />
                </div>
                <Tooltip label="Remove this axis">
                  <ActionIcon
                    variant="default"
                    color="red"
                    size="input-xs"
                    aria-label="Remove this axis"
                    onClick={() => {
                      set(removeAxis(st, extra.id));
                      setTab('bottom');
                    }}
                  >
                    <Trash2 size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Row>
            <div className="prop-note">
              Curves on this axis: choose {extra.id.toUpperCase()} in their style (▸ style ▸ Labels, axes). It sits {extra.style.offset} pt out from the frame (Line ▸ Offset); the automatic margins (Page ▸ Frame) make room for it.
            </div>
          </div>
          <SideSections key={extra.id} side="extra" s={extra.style} onChange={(style) => setExtra({ style })} scale={{ spec: extra.scale, onChange: (scale) => setExtra({ scale }), drawn: limits?.[extra.id], rows: <ScaleRows spec={extra.scale} onChange={(scale) => setExtra({ scale })} drawn={limits?.[extra.id]} /> }} />
        </div>
      )}
      {tab === 'grid' && (
        <Sections panel="axis-grid" open={['x', 'y', 'frame']}>
          <Section value="x" title="Vertical grid (x)" aside={st.grid.x.major || st.grid.x.minor ? undefined : 'none'}>
            <GridRows g={st.grid.x} onChange={(g) => set({ grid: { ...st.grid, x: g } })} />
          </Section>
          <Section value="y" title="Horizontal grid (y)" aside={st.grid.y.major || st.grid.y.minor ? undefined : 'none'}>
            <GridRows g={st.grid.y} onChange={(g) => set({ grid: { ...st.grid, y: g } })} />
          </Section>
          <Section value="frame" title="Frame">
            <Row label="Fill" hint="A colour inside the frame (none: the page shows)">
              <ColorField value={st.background} none onChange={(background) => set({ background })} />
            </Row>
            <Row label="Cut curves" hint="The curves cut at the frame">
              <Toggle value={st.clip} onChange={(clip) => set({ clip })} />
            </Row>
            <Row label="Aspect" hint="Fixed: 1 unit of Y as long as this many units of X (1: equal, for maps and images; empty: the frame as large as fits). Linear axes, automatic frame">
              <Group gap={6} wrap="nowrap">
                <div className="grow">
                  <NumField value={st.aspect ?? NaN} min={0} placeholder="free" onChange={(v) => set({ aspect: v > 0 ? v : undefined })} />
                </div>
                {st.aspect !== undefined && (
                  <Tooltip label="Free again">
                    <ActionIcon variant="default" size="input-xs" onClick={() => set({ aspect: undefined })} aria-label="Free again">
                      <RotateCcw size={14} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Row>
            <Row label="Panel label" hint="In a Merge: empty, the automatic letter (a, b, c …); “-”, none; or your own text">
              <MTextInput value={st.panelLabel} placeholder="auto (Merge)" onChange={(e) => set({ panelLabel: e.currentTarget.value })} />
            </Row>
          </Section>
        </Sections>
      )}
    </div>
  );
}
