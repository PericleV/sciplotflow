// The axes of a Plot: every side (scale, line, ticks, numbers, title), extra axes, the grid and the frame.
import { useState } from 'react';
import { AXIS_DEFAULTS, axisKind, axesStyle, type AxesStyle, type AxisSpec, type ExtraAxis, type GridStyle, type ProbAxis, type Side, type SideStyle } from '../figure/spec.ts';
import { DASHES } from './figureOptions.ts';
import { OptColor, RichInput, Tabs, TextStyleControls } from './fields.tsx';
import { Check, Field, NumInput, Select, TextInput } from './ui.tsx';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';

// The usual angles of a text, one click away (auto: as it comes, when there is one)
function AnglePresets({ onPick, auto }: { onPick: (deg: number) => void; auto?: () => void }) {
  const ANGLES = ['0', '30', '45', '60', '90', '-45', '-90'];
  return (
    <Select<string>
      value=""
      title="The usual angles"
      options={[['', '…'], ...(auto ? [['auto', 'auto'] as [string, string]] : []), ...ANGLES.map((a): [string, string] => [a, `${a.replace('-', '−')}°`])]}
      onChange={(v) => (v === 'auto' ? auto?.() : v !== '' && onPick(Number(v)))}
    />
  );
}

// The breaks of an axis, one per row (from – to), as many as needed; stored as "20-80; 120-150".
function BreaksEditor({ spec, set }: { spec: AxisSpec; set: (p: Partial<AxisSpec>) => void }) {
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
    <div className="breaks">
      <div className="row">
        <span className="muted">Breaks (parts of the axis left out; the curves jump over them)</span>
      </div>
      {rows.map(([a, b], k) => (
        <div key={k} className="row">
          <span className="muted">from</span>
          <NumInput className="short" value={a} onChange={(v) => write(rows.map((r, j) => (j === k ? [v, r[1]] : r)))} />
          <span className="muted">to</span>
          <NumInput className="short" value={b} onChange={(v) => write(rows.map((r, j) => (j === k ? [r[0], v] : r)))} />
          <button className="nodrag ts-btn" title="Remove this break" onClick={() => write(rows.filter((_, j) => j !== k))}>
            <X {...IC} />
          </button>
        </div>
      ))}
      <div className="row">
        <button className="nodrag" onClick={() => write([...rows, [NaN, NaN]])}>
          + Break
        </button>
        {rows.length > 0 && (
          <Field label="Gap" title="The gap drawn at each break, % of the axis length">
            <NumInput className="tiny" min={0.5} step={0.5} value={spec.breakGap ?? 3} onChange={(v) => set({ breakGap: Math.max(0.5, v || 3) })} />
          </Field>
        )}
      </div>
    </div>
  );
}

// dataKinds: the values can be numbers, categories or times (the bottom and left axes of a 1D plot)
function ScaleControls({ spec, onChange, kinds = true, dataKinds = false }: { spec: AxisSpec; onChange: (s: AxisSpec) => void; kinds?: boolean; dataKinds?: boolean }) {
  const set = (p: Partial<AxisSpec>) => onChange({ ...spec, ...p });
  const mode = spec.ticksBy ?? 'auto';
  const vk = spec.kind ?? 'auto';
  return (
    <>
      {dataKinds && (
        <Field label="Values" title="What the values on this axis are: numbers; categories — a column of text (or numbers taken as names), every name at a place 1, 2, 3 …; dates and times (or durations, h:mm:ss). Automatic: categories for a column of text, dates or times when every text reads as one">
          <Select<NonNullable<AxisSpec['kind']>>
            value={vk}
            options={[
              ['auto', 'automatic'],
              ['number', 'numbers'],
              ['category', 'categories (names)'],
              ['time', 'dates and times'],
            ]}
            onChange={(kind) => set({ kind })}
          />
        </Field>
      )}
      {dataKinds && vk === 'category' && (
        <div className="grid2">
          <Field label="Order" title="The names in the order they first come in the data, sorted, or in the order you write (the others after them)">
            <Select<NonNullable<AxisSpec['catOrder']>>
              value={spec.catOrder ?? 'data'}
              options={[
                ['data', 'as in the data'],
                ['sorted', 'sorted'],
                ['custom', 'as I write'],
              ]}
              onChange={(catOrder) => set({ catOrder })}
            />
          </Field>
          <Field label="Spread" title="Points of the same name spread across its place (scatter curves): ± this part of the distance between two names, 0 – 0.45">
            <NumInput className="tiny" min={0} max={0.45} step={0.05} value={spec.jitter ?? 0} onChange={(v) => set({ jitter: Math.min(0.45, Math.max(0, v || 0)) || undefined })} />
          </Field>
        </div>
      )}
      {dataKinds && vk === 'category' && spec.catOrder === 'custom' && (
        <Field label="Names" title="The names in their order, separated by commas: B, A, C">
          <TextInput value={spec.catList ?? ''} placeholder="e.g. Control, Low, High" onChange={(catList) => set({ catList })} />
        </Field>
      )}
      {dataKinds && (vk === 'time' || vk === 'auto') && (
        <div className="grid2">
          <Field label="Time labels" title="Empty: automatic for the step of the ticks. Else written with: yyyy (2024), yy, MMMM (January), MMM (Jan), MM (01), M, dd (05), d, HH (13), H, mm, ss; a duration: H (all the hours), mm, ss; text in quotes: 'h'">
            <TextInput value={spec.timeFormat ?? ''} placeholder="auto (e.g. dd.MM.yyyy)" onChange={(timeFormat) => set({ timeFormat: timeFormat || undefined })} />
          </Field>
          <Field label="Dates as" title="How a date written with slashes is read when both ways could be (5/1/2024): day / month or month / day">
            <Select<NonNullable<AxisSpec['dateOrder']>>
              value={spec.dateOrder ?? 'dmy'}
              options={[
                ['dmy', 'day / month'],
                ['mdy', 'month / day'],
              ]}
              onChange={(dateOrder) => set({ dateOrder })}
            />
          </Field>
        </div>
      )}
      <Field label="From – to" title="Empty: automatic">
        <span className="row">
          <NumInput className="short" value={spec.min} placeholder="auto" onChange={(min) => set({ min })} />–<NumInput className="short" value={spec.max} placeholder="auto" onChange={(max) => set({ max })} />
        </span>
      </Field>
      <div className="grid2">
        <Field label="Automatic" title="How the automatic limits are chosen (when From / to are empty)">
          <Select
            value={spec.range}
            options={[
              ['nice', 'rounded to ticks'],
              ['padded', 'data ± 5 %'],
              ['tight', 'data exactly'],
            ]}
            onChange={(range) => set({ range })}
          />
        </Field>
        {kinds && (
          <Field label="Type">
            <Select
              value={spec.scale}
              options={[
                ['linear', 'linear'],
                ['log', 'log'],
                ['symlog', 'symmetric log (through 0)'],
                ['reciprocal', 'reciprocal 1/x'],
                ['probability', 'probability (%)'],
                ['logit', 'logit (0 – 1)'],
              ]}
              onChange={(scale) => set({ scale })}
            />
          </Field>
        )}
        {kinds && spec.scale === 'log' && (
          <Field label="Base" title="The ticks at the powers of this base (the axis is the same)">
            <Select<10 | 2 | 'e'>
              value={spec.base ?? 10}
              options={[
                [10, '10'],
                [2, '2'],
                ['e', 'e'],
              ]}
              onChange={(base) => set({ base: base === 10 ? undefined : base })}
            />
          </Field>
        )}
        {kinds && spec.scale === 'symlog' && (
          <Field label="Linear within ±" title="Near 0 the axis is linear (from −this to +this), logarithmic beyond: for values of both signs over many decades">
            <NumInput className="short" min={0} value={spec.linthresh ?? 1} onChange={(v) => set({ linthresh: v > 0 ? v : undefined })} />
          </Field>
        )}
      </div>
      {kinds && spec.scale === 'probability' && (
        <Field label="Probability of" title="Values in % (0 < v < 100), placed so that this distribution's cumulative probability is a straight line">
          <Select<ProbAxis>
            value={spec.prob ?? 'normal'}
            options={[
              ['normal', 'normal (Φ⁻¹)'],
              ['logistic', 'logistic (logit)'],
              ['sev', 'Weibull: ln(−ln(1 − p))'],
              ['lev', 'Gumbel: −ln(−ln p)'],
              ['exp', 'exponential: −ln(1 − p)'],
            ]}
            onChange={(prob) => set({ prob })}
          />
        </Field>
      )}
      <Field label="Major ticks" title="Where the numbers are: automatic, from … every …, a number of ticks over the whole axis, or at values you choose">
        <Select
          value={mode}
          options={[
            ['auto', 'automatic'],
            ['increment', 'every … (increment)'],
            ['count', 'number of ticks'],
            ['values', 'at chosen values'],
          ]}
          onChange={(ticksBy) => set({ ticksBy })}
        />
      </Field>
      {mode === 'increment' && (
        <div className="grid2">
          <Field label="Every" title="The distance between two numbers, e.g. 5: 10, 15, 20 …">
            <NumInput className="short" value={spec.step} placeholder="e.g. 5" onChange={(step) => set({ step: step > 0 ? step : NaN })} />
          </Field>
          <Field label="Starting at" title="The first number (empty: the multiples of the step, 0, 5, 10 …)">
            <NumInput className="short" value={spec.first ?? NaN} placeholder="auto" onChange={(first) => set({ first })} />
          </Field>
        </div>
      )}
      {mode === 'count' && (
        <Field label="Ticks" title="This many major ticks, evenly from one end of the axis to the other">
          <NumInput className="tiny" min={2} step={1} value={spec.count} placeholder="5" onChange={(count) => set({ count: count >= 2 ? Math.floor(count) : NaN })} />
        </Field>
      )}
      {mode === 'values' && (
        <Field label="At" title="Values, with optional labels: 400, 532 = green, 633">
          <TextInput value={spec.custom} placeholder="e.g. 400, 532 = green, 633" onChange={(custom) => set({ custom })} />
        </Field>
      )}
      <div className="grid2">
        <Field label="Minor ticks" title="Minor ticks between two major ones">
          <NumInput className="tiny" min={0} max={9} step={1} value={spec.minor} onChange={(minor) => set({ minor: Math.max(0, Math.min(9, Math.floor(minor) || 0)) })} />
        </Field>
        <Field label="Label every" title="A number on every N-th major tick only (1: on all); the other ticks stay">
          <NumInput className="tiny" min={1} step={1} value={spec.labelEvery ?? 1} onChange={(v) => set({ labelEvery: Math.max(1, Math.floor(v) || 1) })} />
        </Field>
      </div>
      <Check label="Reversed (high values first)" value={spec.reverse} onChange={(reverse) => set({ reverse })} />
      {kinds && spec.scale !== 'reciprocal' && spec.scale !== 'probability' && <BreaksEditor spec={spec} set={set} />}
    </>
  );
}

function SideControls({ side, s, onChange }: { side: Side | 'extra'; s: SideStyle; onChange: (s: SideStyle) => void }) {
  const set = (p: Partial<SideStyle>) => onChange({ ...s, ...p });
  const num = (v: number, min = 0) => Math.max(min, Number.isFinite(v) ? v : min);
  return (
    <>
      <div className="row wrap shows">
        <span className="muted">Show:</span>
        <Check label="Line" value={s.line} onChange={(line) => set({ line })} />
        <Check label="Numbers" value={s.labels} onChange={(labels) => set({ labels })} />
        <Check label="Title" value={s.showTitle} onChange={(showTitle) => set({ showTitle })} />
        <Check label="Minor ticks" value={s.minorTicks} onChange={(minorTicks) => set({ minorTicks })} />
      </div>
      <details className="sub">
        <summary>Line and ticks</summary>
        <div className="grid2">
          <Field label="Ticks">
            <Select
              value={s.ticks}
              options={[
                ['in', 'in'],
                ['out', 'out'],
                ['both', 'in and out'],
                ['none', 'none'],
              ]}
              onChange={(ticks) => set({ ticks })}
            />
          </Field>
          <Field label="Colour">
            <input className="nodrag color" type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Field label="Line width" title="pt">
            <NumInput className="tiny" min={0} step={0.25} value={s.lineWidth} onChange={(v) => set({ lineWidth: num(v) })} />
          </Field>
          <Field label="Tick width" title="pt">
            <NumInput className="tiny" min={0} step={0.25} value={s.tickWidth} onChange={(v) => set({ tickWidth: num(v) })} />
          </Field>
          <Field label="Major length" title="pt">
            <NumInput className="tiny" min={0} step={0.5} value={s.tickLen} onChange={(v) => set({ tickLen: num(v) })} />
          </Field>
          <Field label="Minor length" title="pt">
            <NumInput className="tiny" min={0} step={0.5} value={s.minorLen} onChange={(v) => set({ minorLen: num(v) })} />
          </Field>
          <Field label="Offset" title="The axis moved away from the frame, pt (extra axes: side by side)">
            <NumInput className="tiny" step={1} value={s.offset} onChange={(v) => set({ offset: Number.isFinite(v) ? v : 0 })} />
          </Field>
          {side !== 'extra' && (
            <Field label="Cross at" title={`The axis drawn where the other axis is at this value (${side === 'bottom' || side === 'top' ? 'a Y' : 'an X'}): its line, ticks and numbers there, its title at the frame's edge — 0 and 0 for axes through the origin; empty: at the frame's edge`}>
              <NumInput className="tiny" value={s.cross ?? NaN} placeholder="edge" onChange={(v) => set({ cross: Number.isFinite(v) ? v : undefined })} />
            </Field>
          )}
        </div>
      </details>
      <details className="sub">
        <summary>Tick labels (numbers or names)</summary>
        <div className="grid2">
          <Field label="Rotation" title="Degrees: 45 or 90 for long names (the margin grows to fit)">
            <span className="row">
              <NumInput className="tiny" step={15} value={s.rotation} onChange={(v) => set({ rotation: Number.isFinite(v) ? v : 0 })} />
              <AnglePresets onPick={(rotation) => set({ rotation })} />
            </span>
          </Field>
          <Field label="Wrap after" title="Long names broken into lines of about this many characters, at their spaces (empty: one line)">
            <NumInput className="tiny" min={1} step={1} value={s.wrap || NaN} placeholder="—" onChange={(v) => set({ wrap: v >= 1 ? Math.floor(v) : undefined })} />
          </Field>
          <Field label="Format">
            <Select
              value={s.format}
              options={[
                ['auto', 'automatic'],
                ['decimal', 'decimal'],
                ['sci', 'scientific'],
                ['eng', 'engineering'],
                ['common', 'common ×10ⁿ'],
                ['percent', 'percent'],
                ['si', 'SI prefixes (k, M, µ, n)'],
              ]}
              onChange={(format) => set({ format })}
            />
          </Field>
          <Field label="Decimals" title="Empty: automatic">
            <NumInput className="tiny" min={0} max={12} step={1} value={s.decimals} placeholder="auto" onChange={(v) => set({ decimals: v >= 0 ? Math.floor(v) : NaN })} />
          </Field>
          <Field label="Prefix">
            <TextInput className="tiny-text" value={s.prefix} onChange={(prefix) => set({ prefix })} />
          </Field>
          <Field label="Suffix">
            <TextInput className="tiny-text" value={s.suffix} onChange={(suffix) => set({ suffix })} />
          </Field>
          <Field label="Divide by" title="The numbers show value / factor (e.g. 1000: nm → µm)">
            <NumInput className="tiny" step={1} value={s.factor} onChange={(v) => set({ factor: v && Number.isFinite(v) ? v : 1 })} />
          </Field>
          <Field label="Gap" title="Between the ticks and the numbers, pt">
            <NumInput className="tiny" step={0.5} value={s.labelGap} onChange={(v) => set({ labelGap: Number.isFinite(v) ? v : 0 })} />
          </Field>
        </div>
        <div className="row wrap">
          <Check label="+ on positive" value={s.plus} onChange={(plus) => set({ plus })} />
          <Check label="Hide first" value={s.hideFirst} onChange={(hideFirst) => set({ hideFirst })} />
          <Check label="Hide last" value={s.hideLast} onChange={(hideLast) => set({ hideLast })} />
        </div>
        <TextStyleControls label="Font" value={s.labelText} onChange={(labelText) => set({ labelText })} />
      </details>
      <details className="sub">
        <summary>Title</summary>
        <Field label="Text" title="Empty: from the data (the name of the column, with its unit: “Wavelength (nm)”)">
          <RichInput value={s.title} placeholder={side === 'bottom' || side === 'left' || side === 'extra' ? 'auto: the column’s name' : 'title'} onChange={(title) => set({ title })} />
        </Field>
        <TextStyleControls label="Font" value={s.titleText} onChange={(titleText) => set({ titleText })} />
        <Field label="Rotation" title="Degrees; empty: along the axis (bottom, top 0°; left −90°; right 90°) — e.g. 0 for a Y title written level">
          <span className="row">
            <NumInput className="tiny" step={15} value={s.titleRotation ?? NaN} placeholder="auto" onChange={(v) => set({ titleRotation: Number.isFinite(v) ? v : undefined })} />
            <AnglePresets onPick={(titleRotation) => set({ titleRotation })} auto={() => set({ titleRotation: undefined })} />
          </span>
        </Field>
        <Field label="Gap" title="Between the numbers and the title, pt">
          <NumInput className="tiny" step={0.5} value={s.titleGap} onChange={(v) => set({ titleGap: Number.isFinite(v) ? v : 0 })} />
        </Field>
        <Field label="Position" title="Along the axis: at its start, middle or end, or at a place (% of its length; the arrows move it, or drag the title on the figure)">
          <span className="row">
            <Select<SideStyle['titleAlign']>
              value={s.titleAlign ?? 'center'}
              options={
                side === 'extra'
                  ? [
                      ['start', 'start (left / bottom)'],
                      ['center', 'middle'],
                      ['end', 'end (right / top)'],
                      ['custom', 'custom'],
                    ]
                  : side === 'left' || side === 'right'
                  ? [
                      ['start', 'bottom'],
                      ['center', 'middle'],
                      ['end', 'top'],
                      ['custom', 'custom'],
                    ]
                  : [
                      ['start', 'left'],
                      ['center', 'centre'],
                      ['end', 'right'],
                      ['custom', 'custom'],
                    ]
              }
              onChange={(titleAlign) => set({ titleAlign, ...(titleAlign === 'custom' && s.titleAlign !== 'custom' ? { titleAt: s.titleAlign === 'start' ? 0 : s.titleAlign === 'end' ? 100 : 50 } : {}) })}
            />
            {s.titleAlign === 'custom' && <NumInput className="tiny" step={1} min={0} max={100} value={s.titleAt} title="% of the length of the axis, from its start (left / bottom)" onChange={(v) => set({ titleAt: Math.min(100, Math.max(0, Number.isFinite(v) ? v : 50)) })} />}
            {s.titleAlign === 'custom' && <span className="muted">%</span>}
          </span>
        </Field>
      </details>
    </>
  );
}

function GridControls({ name, g, onChange }: { name: string; g: GridStyle; onChange: (g: GridStyle) => void }) {
  const set = (p: Partial<GridStyle>) => onChange({ ...g, ...p });
  return (
    <>
      <div className="row wrap">
        <span className="section-inline">{name}</span>
        <Check label="Major" value={g.major} onChange={(major) => set({ major })} />
        <Check label="Minor" value={g.minor} onChange={(minor) => set({ minor })} />
      </div>
      {(g.major || g.minor) && (
        <div className="grid2">
          <Field label="Colour">
            <input className="nodrag color" type="color" value={g.color} onChange={(e) => set({ color: e.target.value })} />
          </Field>
          <Field label="Minor colour">
            <input className="nodrag color" type="color" value={g.minorColor} onChange={(e) => set({ minorColor: e.target.value })} />
          </Field>
          <Field label="Width" title="pt">
            <NumInput className="tiny" min={0} step={0.1} value={g.width} onChange={(width) => set({ width: Math.max(0, width || 0) })} />
          </Field>
          <Field label="Opacity">
            <NumInput className="tiny" min={0} max={1} step={0.05} value={g.opacity} onChange={(opacity) => set({ opacity: Math.min(1, Math.max(0, opacity || 0)) })} />
          </Field>
          <Field label="Dash">
            <Select value={g.dash} options={DASHES} onChange={(dash) => set({ dash })} />
          </Field>
        </div>
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
export function AxesEditor({ value, onChange, dataKinds = false, show }: { value: Partial<AxesStyle> | undefined; onChange: (s: AxesStyle) => void; dataKinds?: boolean; show?: { axis: string; seq: number } }) {
  const st = axesStyle(value);
  const set = (patch: Partial<AxesStyle>) => onChange({ ...st, ...patch });
  const [tab, setTab] = useState<string>(show?.axis ?? 'bottom');
  const [seen, setSeen] = useState(show?.seq);
  if (show && show.seq !== seen) {
    setSeen(show.seq);
    setTab(show.axis);
  }
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
    const onSide = st.extra.filter((e) => e.side === s).length + 1;
    set({ extra: [...st.extra, { id: nid, side: s, scale: AXIS_DEFAULTS, style: { ...st.sides[s === 'top' || s === 'bottom' ? 'bottom' : 'left'], labels: true, showTitle: true, title: '', offset: 40 * onSide } }] });
    setTab(nid);
  };
  const second = side === 'top' ? st.top : side === 'right' ? st.right : null;
  const setSecond = (p: Partial<AxesStyle['top']>) => (side === 'top' ? set({ top: { ...st.top, ...p } }) : set({ right: { ...st.right, ...p } }));
  return (
    <div className="axes-editor">
      <Tabs tabs={[...SIDES, ...st.extra.map((e): [string, string] => [e.id, `${e.id.toUpperCase()} ${e.side}`]), ['grid', 'Grid, frame']]} value={tab} onChange={setTab} />
      <div className="row wrap add-axis">
        <span className="muted">Add an axis:</span>
        <button className="nodrag" title="Another Y axis on the right (a third Y), moved out from the frame" onClick={() => addAxis('right')}>
          + Y right
        </button>
        <button className="nodrag" title="Another Y axis on the left" onClick={() => addAxis('left')}>
          + Y left
        </button>
        <button className="nodrag" title="Another X axis on top" onClick={() => addAxis('top')}>
          + X top
        </button>
        <button className="nodrag" title="Another X axis at the bottom" onClick={() => addAxis('bottom')}>
          + X bottom
        </button>
      </div>
      {side && (
        <div className="side-panel">
          {second && (
            <>
              <Field label="This axis" title="A mirror of the opposite axis (same scale), its own scale (curves choose it in their style: X2 / Y2), or a function of the opposite axis">
                <Select
                  value={second.mode}
                  options={[
                    ['mirror', `mirror of the ${OPPOSITE[side]}`],
                    ['own', 'its own scale'],
                    ['function', `function of the ${OPPOSITE[side]}`],
                  ]}
                  onChange={(mode) => setSecond({ mode })}
                />
              </Field>
              {second.mode === 'function' && (
                <Field label="Value = f(x)" title="A formula of x, the value on the opposite axis — e.g. 1239.84/x for eV over nm, 1e7/x for cm⁻¹ over nm">
                  <TextInput value={second.fn} placeholder="e.g. 1239.84/x" onChange={(fn) => setSecond({ fn })} />
                </Field>
              )}
            </>
          )}
          {(side === 'bottom' || side === 'left' || (second && second.mode !== 'mirror')) && (
            <details className="sub" open>
              <summary>Scale</summary>
              <ScaleControls
                spec={side === 'bottom' ? st.x : side === 'left' ? st.y : second!.scale}
                kinds={!(second && second.mode === 'function')}
                dataKinds={dataKinds && (side === 'bottom' || side === 'left')}
                onChange={(sp) => (side === 'bottom' ? set({ x: sp }) : side === 'left' ? set({ y: sp }) : setSecond({ scale: sp }))}
              />
            </details>
          )}
          <SideControls side={side} s={st.sides[side]} onChange={(s) => setSide(side, s)} />
          <div className="row wrap">
            <span className="muted">Copy this look to:</span>
            <button className="nodrag" onClick={() => copySide(side, [OPPOSITE[side]])}>
              the {OPPOSITE[side]} axis
            </button>
            <button className="nodrag" onClick={() => copySide(side, SIDES.map(([k]) => k).filter((k) => k !== side))}>
              All four
            </button>
          </div>
        </div>
      )}
      {extra && (
        <div className="side-panel">
          <div className="grid2">
            <Field label="Side">
              <Select
                value={extra.side}
                options={
                  axisKind(extra.side) === 'y'
                    ? [
                        ['right', 'right'],
                        ['left', 'left'],
                      ]
                    : [
                        ['top', 'top'],
                        ['bottom', 'bottom'],
                      ]
                }
                onChange={(s) => setExtra({ side: s })}
              />
            </Field>
            <button
              className="nodrag danger"
              onClick={() => {
                set({ extra: st.extra.filter((e) => e.id !== extra.id) });
                setTab('bottom');
              }}
            >
              Remove this axis
            </button>
          </div>
          <div className="hint">
            Curves on this axis: choose {extra.id.toUpperCase()} in their style (▸ style ▸ Labels, axes). It sits {extra.style.offset} pt out from the
            frame (Line and ticks ▸ Offset); the automatic margins (Page ▸ Frame) make room for it.
          </div>
          <details className="sub" open>
            <summary>Scale</summary>
            <ScaleControls spec={extra.scale} onChange={(scale) => setExtra({ scale })} />
          </details>
          <SideControls side="extra" s={extra.style} onChange={(style) => setExtra({ style })} />
        </div>
      )}
      {tab === 'grid' && (
        <div className="side-panel">
          <GridControls name="Vertical grid (x)" g={st.grid.x} onChange={(g) => set({ grid: { ...st.grid, x: g } })} />
          <GridControls name="Horizontal grid (y)" g={st.grid.y} onChange={(g) => set({ grid: { ...st.grid, y: g } })} />
          <div className="grid2">
            <Field label="Frame fill">
              <OptColor value={st.background} onChange={(background) => set({ background })} />
            </Field>
            <Check label="Cut curves at the frame" value={st.clip} onChange={(clip) => set({ clip })} />
            <Field label="Aspect" title="Fixed: 1 unit of Y as long as this many units of X (1: equal, for maps and images; empty: the frame as large as fits). Linear axes, automatic frame">
              <NumInput className="tiny" min={0} step={0.1} value={st.aspect ?? NaN} placeholder="free" onChange={(v) => set({ aspect: v > 0 ? v : undefined })} />
            </Field>
          </div>
          <Field label="Panel label" title="In a Merge: empty — the automatic letter (a, b, c …); “-” — none; or your own text">
            <TextInput value={st.panelLabel} placeholder="auto (Merge)" onChange={(panelLabel) => set({ panelLabel })} />
          </Field>
        </div>
      )}
    </div>
  );
}
