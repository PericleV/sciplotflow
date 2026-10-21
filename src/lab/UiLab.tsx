// A page to try the new look before it goes into the app (#ui-lab): a real Plot with an arrow and a text, their
// properties panels with every setting, the floating quick bar, the axes showing the values used when left automatic,
// and the buttons and fields as they are now and as they would be.
import '@mantine/core/styles.css';
import '../ui/props.css';
import './lab.css';
import { ActionIcon, Button, Checkbox, Group, MantineProvider, NumberInput, Select, Switch, Tabs, Text, Textarea, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Edge } from '@xyflow/react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDownToLine, ArrowRightLeft, ArrowUpToLine, BringToFront, Copy, Eye, EyeOff, Lock, LockOpen, MoveUpRight, Plus, SendToBack, Trash2, Type, X } from 'lucide-react';
import { resolver, theme, useScheme } from '../ui/theme.ts';
import { AnchorField, AngleField, AutoNumber, Choice, ColorField, OpacityField, PictureGrid, PicturePick, Row, Section, Sections, SliderField, WidthField } from '../ui/props.tsx';
import { BodyIcon, BoxIcon, CapIcon, DashIcon, HeadIcon, JoinIcon, RouteIcon } from '../ui/propIcons.tsx';
import { AXIS_DEFAULTS, FONTS, SHAPE_DEFAULTS, TEXT_SPEC_DEFAULTS, toPt, type Anchor, type ArrowBody, type ArrowHead, type AxisRange, type AxisSpec, type Dash, type Figure, type ShapeSpec, type TextSpec, type TextStyle } from '../figure/spec.ts';
import type { Elbow } from '../figure/shapes.ts';
import { FigureSvg } from '../figure/render.tsx';
import { axesGeometry } from '../figure/axes.ts';
import { evaluateGraph } from '../engine/evaluate.ts';
import { IMPORT_DEFAULTS, PLOT1D_DEFAULTS } from '../defaults.ts';
import type { AppNode } from '../types.ts';
import { applyColors, applyTheme, loadColors, loadTheme, SWATCHES, type Theme } from '../theme.ts';

// ---- the data: an absorbance spectrum (a plasmon band near 527 nm) ----
const SPECTRUM = (() => {
  const rows = ['Wavelength (nm);Absorbance'];
  for (let w = 400; w <= 700; w += 2) rows.push(`${w};${(0.08 + 0.9 * Math.exp(-(((w - 527) / 42) ** 2)) + 0.25 * Math.exp(-(w - 400) / 40)).toFixed(4)}`);
  return rows.join('\n') + '\n';
})();

const HEADS: [ArrowHead, string][] = [
  ['none', 'none'],
  ['triangle', 'triangle'],
  ['stealth', 'stealth'],
  ['open', 'open'],
  ['bar', 'bar'],
  ['circle', 'circle'],
  ['diamond', 'diamond'],
  ['square', 'square'],
  ['half', 'half'],
];
const BODIES: [ArrowBody, string][] = [
  ['single', 'one line'],
  ['double', 'two lines'],
  ['tapered', 'tapered'],
  ['wavy', 'wave'],
  ['zigzag', 'zigzag'],
  ['equilibrium', 'equilibrium ⇌'],
  ['eqRight', 'equilibrium, to the right'],
  ['eqLeft', 'equilibrium, to the left'],
  ['retro', 'retrosynthetic ⇒'],
];
const ROUTES: ['line' | Elbow, string][] = [
  ['line', 'line or curve'],
  ['hv', 'across, then down'],
  ['vh', 'down, then across'],
  ['hvh', 'across, down, across'],
  ['vhv', 'down, across, down'],
];
const DASHES: [Dash, string][] = [
  ['solid', 'solid'],
  ['dash', 'dash'],
  ['longdash', 'long dash'],
  ['shortdash', 'short dash'],
  ['dot', 'dot'],
  ['dashdot', 'dash-dot'],
  ['dashdotdot', 'dash-dot-dot'],
];
const dashPics = DASHES.map(([d, n]): [Dash, ReactNode, string] => [d, <DashIcon key={d} dash={d} />, n]);

type Obj = { name: string; hidden: boolean; locked: boolean };
type Sel = 'arrow' | 'text';

// ---- the shared parts ----
function ObjectHead({ icon, kind, o, setO, z, setZ, quick, setQuick }: { icon: ReactNode; kind: string; o: Obj; setO: (p: Partial<Obj>) => void; z: number; setZ: (z: number) => void; quick: boolean; setQuick: (b: boolean) => void }) {
  return (
    <div className="obj-head">
      <div className="obj-title">
        <span className="obj-icon">{icon}</span>
        <TextInput className="grow" variant="unstyled" value={o.name} placeholder={kind} onChange={(e) => setO({ name: e.currentTarget.value })} aria-label="Name" />
        <Tooltip label={o.hidden ? 'Show it' : 'Hide it'}>
          <ActionIcon onClick={() => setO({ hidden: !o.hidden })} aria-label="Visible">{o.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</ActionIcon>
        </Tooltip>
        <Tooltip label={o.locked ? 'Unlock: moved with the mouse again' : 'Lock: not moved with the mouse'}>
          <ActionIcon onClick={() => setO({ locked: !o.locked })} aria-label="Lock" color={o.locked ? 'accent' : 'gray'}>{o.locked ? <Lock size={15} /> : <LockOpen size={15} />}</ActionIcon>
        </Tooltip>
        <Tooltip label="A copy of it">
          <ActionIcon aria-label="Copy"><Copy size={15} /></ActionIcon>
        </Tooltip>
        <Tooltip label="Remove it">
          <ActionIcon color="red" aria-label="Remove"><Trash2 size={15} /></ActionIcon>
        </Tooltip>
      </div>
      <div className="obj-meta">
        <Text size="xs" c="dimmed">{kind} · on the plot</Text>
        <div className="grow" />
        <Switch size="xs" label="Quick bar" checked={quick} onChange={(e) => setQuick(e.currentTarget.checked)} />
      </div>
      <Row label="Layer" hint="Under the curves or over them; then which comes first among the objects">
        <Group gap={6} wrap="nowrap">
          <div className="grow">
            <Choice value={z < 0 ? 'under' : 'over'} onChange={(v) => setZ(v === 'under' ? -Math.max(1, Math.abs(z)) : Math.max(1, Math.abs(z)))} options={[['under', 'Under data'], ['over', 'Over data']]} />
          </div>
          <Tooltip label="Back one step"><ActionIcon variant="default" size="input-xs" onClick={() => setZ(z - 1 === 0 ? -1 : z - 1)} aria-label="Back"><SendToBack size={14} /></ActionIcon></Tooltip>
          <Tooltip label="Forward one step"><ActionIcon variant="default" size="input-xs" onClick={() => setZ(z + 1 === 0 ? 1 : z + 1)} aria-label="Forward"><BringToFront size={14} /></ActionIcon></Tooltip>
        </Group>
      </Row>
    </div>
  );
}

function CoordsRow({ value, onChange }: { value: 'data' | 'percent'; onChange: (v: 'data' | 'percent') => void }) {
  return (
    <Row label="Units" hint="In the units of the data (it stays on its point when the limits change), or in % of the frame">
      <Choice value={value} onChange={onChange} options={[['data', 'Data'], ['percent', '% of frame']]} />
    </Row>
  );
}
function XY({ label, x, y, onChange, unit }: { label: string; x: number; y: number; onChange: (x: number, y: number) => void; unit: string }) {
  return (
    <Row label={label}>
      <div className="prop-pair">
        <NumberInput leftSection={<Text size="xs" c="dimmed">x</Text>} value={+x.toPrecision(5)} onChange={(v) => typeof v === 'number' && onChange(v, y)} rightSection={unit && <Text size="xs" c="dimmed">{unit}</Text>} hideControls />
        <NumberInput leftSection={<Text size="xs" c="dimmed">y</Text>} value={+y.toPrecision(5)} onChange={(v) => typeof v === 'number' && onChange(x, v)} rightSection={unit && <Text size="xs" c="dimmed">{unit}</Text>} hideControls />
      </div>
    </Row>
  );
}

// a text's font, size, bold, italic, colour: empty = as the figure (its value shown)
function TextLook({ v, set, page }: { v: TextStyle; set: (p: Partial<TextStyle>) => void; page: { font: string; size: number; color: string } }) {
  const pageFont = FONTS.find(([f]) => f === page.font)?.[1] ?? 'Arial';
  const cycle = (b: boolean | undefined) => (b === undefined ? true : b ? false : undefined);
  const state = (b: boolean | undefined) => (b === undefined ? ' auto' : b ? ' on' : '');
  return (
    <>
      <Row label="Font">
        <Select value={v.font ?? 'auto'} onChange={(f) => set({ font: !f || f === 'auto' ? undefined : f })} data={[{ value: 'auto', label: `Auto (${pageFont})` }, ...FONTS.map(([f, l]) => ({ value: f, label: l }))]} />
      </Row>
      <Row label="Size">
        <div className="chip-row">
          <UnstyledButton className={`chip${v.size === undefined ? ' on' : ' auto'}`} onClick={() => set({ size: undefined })}>auto {page.size}</UnstyledButton>
          {[6, 7, 8, 9, 10, 12, 14].map((s) => (
            <UnstyledButton key={s} className={`chip${v.size === s ? ' on' : ''}`} onClick={() => set({ size: s })}>{s}</UnstyledButton>
          ))}
        </div>
      </Row>
      <Row label="Style" hint="Each: auto (as the figure), on, off">
        <div className="toggle-row">
          <Tooltip label={`Bold: ${v.bold === undefined ? 'auto' : v.bold ? 'on' : 'off'}`}>
            <UnstyledButton className={`toggle${state(v.bold)}`} onClick={() => set({ bold: cycle(v.bold) })}><b>B</b></UnstyledButton>
          </Tooltip>
          <Tooltip label={`Italic: ${v.italic === undefined ? 'auto' : v.italic ? 'on' : 'off'}`}>
            <UnstyledButton className={`toggle${state(v.italic)}`} onClick={() => set({ italic: cycle(v.italic) })}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></UnstyledButton>
          </Tooltip>
        </div>
      </Row>
      <Row label="Colour">
        <ColorField value={v.color ?? ''} auto={page.color} onChange={(c) => set({ color: c || undefined })} />
      </Row>
    </>
  );
}

type ShadowLook = { shadowX?: number; shadowY?: number; shadowBlur?: number; shadowColor?: string; shadowOpacity?: number };
function ShadowRows({ v, def, set }: { v: ShadowLook; def: { x: number; y: number; blur: number; opacity: number }; set: (p: ShadowLook) => void }) {
  const [x, y] = [v.shadowX ?? def.x, v.shadowY ?? def.y];
  const dist = Math.hypot(x, y);
  const angle = dist ? Math.round((Math.atan2(y, x) * 180) / Math.PI) : 45;
  const move = (a: number, d: number) => set({ shadowX: +(d * Math.cos((a * Math.PI) / 180)).toFixed(3), shadowY: +(d * Math.sin((a * Math.PI) / 180)).toFixed(3) });
  return (
    <div className="prop-sub">
      <Row label="Direction" hint="Where the shadow falls: 0° to the right, 90° down">
        <AngleField value={angle} onChange={(a) => move(a, dist || 1)} />
      </Row>
      <Row label="Distance"><SliderField value={dist} onChange={(d) => move(angle, d)} min={0} max={10} step={0.25} unit="pt" /></Row>
      <Row label="Softness"><SliderField value={v.shadowBlur ?? def.blur} onChange={(b) => set({ shadowBlur: b })} min={0} max={10} step={0.25} unit="pt" /></Row>
      <Row label="Opacity"><OpacityField value={v.shadowOpacity ?? def.opacity} onChange={(o) => set({ shadowOpacity: o })} /></Row>
      <Row label="Colour"><ColorField value={v.shadowColor ?? ''} auto="#000000" onChange={(c) => set({ shadowColor: c || undefined })} /></Row>
    </div>
  );
}

// ---- the arrow ----
function ArrowPanel({ s, set, o, setO, quick, setQuick, page }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void; o: Obj; setO: (p: Partial<Obj>) => void; quick: boolean; setQuick: (b: boolean) => void; page: { font: string; size: number; color: string } }) {
  const body = s.body ?? 'single';
  const gapped = body === 'double' || body === 'retro' || body.startsWith('eq');
  const route = s.route ?? 'line';
  const unit = s.coords === 'percent' ? '%' : '';
  const heads = (start: boolean) => HEADS.map(([h, n]): [ArrowHead, ReactNode, string] => [h, <HeadIcon key={h} head={h} start={start} />, n]);
  const corners = route !== 'line' || !!s.bends;
  return (
    <div className="props-panel">
      <ObjectHead icon={<MoveUpRight size={16} />} kind="Arrow" o={o} setO={setO} z={s.z} setZ={(z) => set({ z })} quick={quick} setQuick={setQuick} />
      <Sections panel="arrow" open={['arrow', 'line']}>
        <Section value="arrow" title="Arrow" aside={`${HEADS.find(([h]) => h === s.head2)?.[1]}, ${BODIES.find(([b]) => b === body)?.[1]}`}>
          <Row label="Heads" hint="At the start and at the end">
            <Group gap={6} wrap="nowrap">
              <PicturePick label="Head at start" value={s.head1} onChange={(head1) => set({ head1 })} options={heads(true)} />
              <Tooltip label="Swap the heads"><ActionIcon variant="subtle" onClick={() => set({ head1: s.head2, head2: s.head1 })} aria-label="Swap the heads"><ArrowRightLeft size={14} /></ActionIcon></Tooltip>
              <PicturePick label="Head at end" value={s.head2} onChange={(head2) => set({ head2 })} options={heads(false)} />
            </Group>
          </Row>
          <Row label="Head size"><SliderField value={s.headSize} onChange={(headSize) => set({ headSize })} min={1} max={15} step={0.5} unit="pt" /></Row>
          <Row label="Route" hint="A line (straight, bent, or through points), or an elbow">
            <PictureGrid value={route} onChange={(r) => set({ route: r === 'line' ? undefined : r })} options={ROUTES.map(([r, n]) => [r, <RouteIcon key={r} route={r} />, n])} cols={5} />
          </Row>
          {route === 'line' && !s.bends && (
            <Row label="Bend" hint="0: straight; either way: its middle pushed to that side (also: drag its middle handle)">
              <SliderField value={s.curve ?? 0} onChange={(curve) => set({ curve: curve || undefined })} min={-1} max={1} step={0.05} marks={[0]} />
            </Row>
          )}
          {route === 'line' && (
            <Row label="Through" hint="Points the line goes through (a smooth curve through them all), dragged on the figure">
              <Group gap={6}>
                <Button variant="default" leftSection={<Plus size={13} />} onClick={() => set({ bends: `${(s.x1 + s.x2) / 2} ${(s.y1 + s.y2) / 2 + (s.coords === 'data' ? 0.05 : 5)}` })}>Add a point</Button>
                {s.bends && <Button variant="subtle" color="gray" onClick={() => set({ bends: undefined })}>Remove</Button>}
              </Group>
            </Row>
          )}
          <Row label="Body">
            <PicturePick label="Body" value={body} onChange={(b) => set({ body: b === 'single' ? undefined : b })} options={BODIES.map(([b, n]) => [b, <BodyIcon key={b} body={b} />, n])} />
          </Row>
          {gapped && <Row label="Gap" hint="Between its two lines"><SliderField value={s.gap ?? Math.max(2, s.headSize * 0.5)} onChange={(gap) => set({ gap })} min={0.5} max={10} step={0.25} unit="pt" /></Row>}
          {body === 'tapered' && <Row label="Start width" hint="Its width at the start (at the end: the line width)"><SliderField value={s.width2 ?? 0} onChange={(width2) => set({ width2 })} min={0} max={8} step={0.25} unit="pt" /></Row>}
          {(body === 'wavy' || body === 'zigzag') && (
            <>
              <Row label="Wave height"><SliderField value={s.amp ?? 2} onChange={(amp) => set({ amp })} min={0.25} max={8} step={0.25} unit="pt" /></Row>
              <Row label="Wave length"><SliderField value={s.wave ?? 6} onChange={(wave) => set({ wave })} min={1} max={20} step={0.5} unit="pt" /></Row>
            </>
          )}
          <Row label="Crossed out" hint="A cross in its middle: the reaction does not happen">
            <Switch checked={!!s.cross} onChange={(e) => set({ cross: e.currentTarget.checked || undefined })} />
          </Row>
        </Section>
        <Section value="line" title="Line" aside={`${s.width} pt`}>
          <Row label="Colour"><ColorField value={s.color} onChange={(color) => set({ color: color || '#000000' })} /></Row>
          <Row label="Width"><WidthField value={s.width} onChange={(width) => set({ width })} /></Row>
          <Row label="Style"><PictureGrid value={s.dash} onChange={(dash) => set({ dash, dashPattern: undefined })} options={dashPics} cols={4} /></Row>
          <Row label="Opacity"><OpacityField value={s.opacity} onChange={(opacity) => set({ opacity })} /></Row>
          <Row label="Ends" hint="The ends of the line: flat, round, square">
            <Choice value={s.cap ?? 'butt'} onChange={(cap) => set({ cap })} options={[['butt', <CapIcon key="butt" cap="butt" />, 'flat'], ['round', <CapIcon key="round" cap="round" />, 'round'], ['square', <CapIcon key="square" cap="square" />, 'square']]} />
          </Row>
          {corners && (
            <Row label="Corners" hint="How its pieces meet: sharp, round, cut">
              <Choice value={s.join ?? 'miter'} onChange={(join) => set({ join })} options={[['miter', <JoinIcon key="miter" join="miter" />, 'sharp'], ['round', <JoinIcon key="round" join="round" />, 'round'], ['bevel', <JoinIcon key="bevel" join="bevel" />, 'cut']]} />
            </Row>
          )}
        </Section>
        <Section value="labels" title="Text on it" aside={s.text || s.text2 ? 'yes' : 'none'} icon={<Type size={14} />}>
          <Row label="Above" hint="Over the line, e.g. the reagents"><TextInput value={s.text} placeholder="none" onChange={(e) => set({ text: e.currentTarget.value })} /></Row>
          <Row label="Below" hint="Under the line, e.g. the conditions"><TextInput value={s.text2 ?? ''} placeholder="none" onChange={(e) => set({ text2: e.currentTarget.value || undefined })} /></Row>
          {(!!s.text || !!s.text2) && (
            <>
              <TextLook v={s.textStyle} set={(p) => set({ textStyle: { ...s.textStyle, ...p } })} page={page} />
              <Row label="Where" hint="Along the line: 0 % its start, 100 % its end"><SliderField value={Math.round((s.labelAt ?? 0.5) * 100)} onChange={(v) => set({ labelAt: v / 100 })} min={0} max={100} step={1} unit="%" marks={[50]} /></Row>
              <Row label="Gap" hint="Between the line and its texts"><SliderField value={s.textGap ?? 1.5} onChange={(textGap) => set({ textGap })} min={0} max={10} step={0.25} unit="pt" /></Row>
              <Row label="Direction"><Choice value={s.textDir === 'level' ? 'level' : 'along'} onChange={(textDir) => set({ textDir })} options={[['along', 'Along it'], ['level', 'Level']]} /></Row>
            </>
          )}
        </Section>
        <Section value="place" title="Position" aside={s.coords === 'data' ? 'data units' : '% of frame'}>
          <CoordsRow value={s.coords} onChange={(coords) => set({ coords })} />
          <XY label="Start" x={s.x1} y={s.y1} unit={unit} onChange={(x1, y1) => set({ x1, y1 })} />
          <XY label="End" x={s.x2} y={s.y2} unit={unit} onChange={(x2, y2) => set({ x2, y2 })} />
        </Section>
        <Section value="effects" title="Effects" aside={[s.shadow && 'shadow', s.blur && 'blur'].filter(Boolean).join(', ') || 'none'}>
          <Row label="Shadow"><Switch checked={!!s.shadow} onChange={(e) => set({ shadow: e.currentTarget.checked || undefined })} /></Row>
          {s.shadow && <ShadowRows v={s} def={{ x: 1.5, y: 1.5, blur: 0, opacity: 0.3 }} set={set} />}
          <Row label="Blur" hint="The whole arrow blurred (0: sharp)"><SliderField value={s.blur ?? 0} onChange={(blur) => set({ blur: blur || undefined })} min={0} max={5} step={0.1} unit="pt" /></Row>
        </Section>
        <Section value="more" title="More">
          <Row label="Own dashes" hint="Dashes of your own, in pt: dash gap dash gap … (e.g. 6 2 1 2); empty: the style chosen"><TextInput value={s.dashPattern ?? ''} placeholder="e.g. 6 2 1 2" onChange={(e) => set({ dashPattern: e.currentTarget.value || undefined })} /></Row>
          {corners && (s.join ?? 'miter') === 'miter' && <Row label="Sharp up to" hint="How far a sharp corner may reach, × the width (beyond: cut)"><SliderField value={s.miter ?? 4} onChange={(miter) => set({ miter: miter === 4 ? undefined : miter })} min={1} max={10} step={0.5} unit="×" /></Row>}
        </Section>
      </Sections>
    </div>
  );
}

// ---- the text ----
const ALIGNS: ['auto' | 'left' | 'center' | 'right' | 'justify', ReactNode, string][] = [
  ['auto', 'Auto', 'As its anchor'],
  ['left', <AlignLeft key="Left" size={14} />, 'Left'],
  ['center', <AlignCenter key="Center" size={14} />, 'Centred'],
  ['right', <AlignRight key="Right" size={14} />, 'Right'],
  ['justify', <AlignJustify key="Justify" size={14} />, 'Justified'],
];
function TextPanel({ s, set, o, setO, quick, setQuick, page }: { s: TextSpec; set: (p: Partial<TextSpec>) => void; o: Obj; setO: (p: Partial<Obj>) => void; quick: boolean; setQuick: (b: boolean) => void; page: { font: string; size: number; color: string } }) {
  const unit = s.coords === 'percent' ? '%' : '';
  const fill = s.box === 'fill' || s.box === 'both';
  const border = s.box === 'border' || s.box === 'both';
  return (
    <div className="props-panel">
      <ObjectHead icon={<Type size={16} />} kind="Text" o={o} setO={setO} z={s.z} setZ={(z) => set({ z })} quick={quick} setQuick={setQuick} />
      <Sections panel="text" open={['text', 'place']}>
        <Section value="text" title="Text" aside={`${s.style.size ?? page.size} pt`}>
          <Textarea autosize minRows={2} value={s.text} onChange={(e) => set({ text: e.currentTarget.value })} mt={6} aria-label="Text" />
          <TextLook v={s.style} set={(p) => set({ style: { ...s.style, ...p } })} page={page} />
          <Row label="Lines" hint="How its lines line up (several lines)">
            <Choice value={s.align ?? 'auto'} onChange={(a) => set({ align: a === 'auto' ? undefined : a })} options={ALIGNS} />
          </Row>
        </Section>
        <Section value="place" title="Position" aside={`${s.rotation}°`}>
          <CoordsRow value={s.coords} onChange={(coords) => set({ coords })} />
          <XY label="At" x={s.x} y={s.y} unit={unit} onChange={(x, y) => set({ x, y })} />
          <Row label="Anchor" hint="Which point of the text is at that place">
            <AnchorField<Anchor> value={s.anchor} onChange={(anchor) => set({ anchor })} />
          </Row>
          <Row label="Rotation" hint="Clockwise (also: the round handle above it on the figure)">
            <AngleField value={s.rotation} onChange={(rotation) => set({ rotation })} />
          </Row>
        </Section>
        <Section value="box" title="Box" aside={s.box === 'none' ? 'none' : s.box}>
          <Row label="Box">
            <Choice value={s.box} onChange={(box) => set({ box })} options={[['none', <BoxIcon key="none" box="none" />, 'none'], ['fill', <BoxIcon key="fill" box="fill" />, 'filled'], ['border', <BoxIcon key="border" box="border" />, 'border'], ['both', <BoxIcon key="both" box="both" />, 'filled, with a border']]} />
          </Row>
          {fill && (
            <>
              <Row label="Fill"><ColorField value={s.boxColor} onChange={(boxColor) => set({ boxColor: boxColor || '#ffffff' })} /></Row>
              <Row label="Fill opacity"><OpacityField value={s.boxOpacity ?? 1} onChange={(boxOpacity) => set({ boxOpacity })} /></Row>
            </>
          )}
          {border && (
            <>
              <Row label="Border"><ColorField value={s.borderColor} onChange={(borderColor) => set({ borderColor: borderColor || '#000000' })} /></Row>
              <Row label="Width"><WidthField value={s.borderWidth} onChange={(borderWidth) => set({ borderWidth })} max={4} /></Row>
              <Row label="Style"><PictureGrid value={s.borderDash ?? 'solid'} onChange={(borderDash) => set({ borderDash })} options={dashPics} cols={4} /></Row>
              <Row label="Opacity"><OpacityField value={s.borderOpacity ?? 1} onChange={(borderOpacity) => set({ borderOpacity })} /></Row>
            </>
          )}
          {s.box !== 'none' && (
            <>
              <Row label="Corners" hint="Rounded corners"><SliderField value={s.radius ?? 0} onChange={(radius) => set({ radius })} min={0} max={10} step={0.25} unit="pt" /></Row>
              <Row label="Padding" hint="The room around the text"><SliderField value={s.padding} onChange={(padding) => set({ padding })} min={0} max={10} step={0.25} unit="pt" /></Row>
              <Row label="Shadow"><Switch checked={!!s.shadow} onChange={(e) => set({ shadow: e.currentTarget.checked })} label="under the box" /></Row>
            </>
          )}
        </Section>
        <Section value="effects" title="Effects" aside={[s.textShadow && 'shadow', s.blur && 'blur'].filter(Boolean).join(', ') || 'none'}>
          <Row label="Shadow" hint="A soft shadow of its letters"><Switch checked={!!s.textShadow} onChange={(e) => set({ textShadow: e.currentTarget.checked || undefined })} label="of the letters" /></Row>
          {s.textShadow && <ShadowRows v={s} def={{ x: 1, y: 1, blur: 1, opacity: 0.4 }} set={set} />}
          <Row label="Blur" hint="The text (and its box) blurred (0: sharp)"><SliderField value={s.blur ?? 0} onChange={(blur) => set({ blur: blur || undefined })} min={0} max={5} step={0.1} unit="pt" /></Row>
        </Section>
      </Sections>
    </div>
  );
}

// ---- an axis: its limits and step, the automatic ones shown ----
function AxisCard({ title, spec, set, auto }: { title: string; spec: AxisSpec; set: (p: Partial<AxisSpec>) => void; auto: { lo: number; hi: number; step: number } | null }) {
  return (
    <div className="props-panel axis-card">
      <div className="axis-head">{title}</div>
      <div className="axis-body">
        <Row label="Start"><AutoNumber value={spec.min} auto={auto?.lo} onChange={(min) => set({ min })} /></Row>
        <Row label="End"><AutoNumber value={spec.max} auto={auto?.hi} onChange={(max) => set({ max })} /></Row>
        <Row label="Step" hint="Between two numbers on the axis"><AutoNumber value={spec.step} auto={auto?.step} onChange={(step) => set({ step, ticksBy: Number.isFinite(step) ? 'increment' : 'auto' })} /></Row>
        <Row label="Auto range" hint="When Start or End is auto: rounded out to the ticks, the data ± 5 %, or the data exactly">
          <Choice<AxisRange> value={spec.range} onChange={(range) => set({ range })} options={[['nice', 'Round'], ['padded', '± 5 %'], ['tight', 'Exact']]} />
        </Row>
        <Row label="Reversed"><Switch checked={spec.reverse} onChange={(e) => set({ reverse: e.currentTarget.checked })} /></Row>
      </div>
    </div>
  );
}

// ---- the quick bar over the object selected ----
function QuickBar({ sel, arrow, setArrow, text, setText, at, onHide }: { sel: Sel; arrow: ShapeSpec; setArrow: (p: Partial<ShapeSpec>) => void; text: TextSpec; setText: (p: Partial<TextSpec>) => void; at: { x: number; y: number }; onHide: () => void }) {
  return (
    <div className="quick-bar" style={{ left: at.x, top: at.y }}>
      {sel === 'arrow' ? (
        <>
          <ColorField value={arrow.color} onChange={(color) => setArrow({ color: color || '#000000' })} />
          <span className="qb-sep" />
          {[0.5, 1, 1.5, 2].map((w) => (
            <UnstyledButton key={w} className={`chip${arrow.width === w ? ' on' : ''}`} onClick={() => setArrow({ width: w })}>{w}</UnstyledButton>
          ))}
          <span className="qb-sep" />
          <PicturePick label="Line style" value={arrow.dash} onChange={(dash) => setArrow({ dash })} options={dashPics} cols={4} />
          <PicturePick label="Head at end" value={arrow.head2} onChange={(head2) => setArrow({ head2 })} options={HEADS.map(([h, n]) => [h, <HeadIcon key={h} head={h} />, n])} />
        </>
      ) : (
        <>
          <ColorField value={text.style.color ?? ''} auto="#000000" onChange={(c) => setText({ style: { ...text.style, color: c || undefined } })} />
          <span className="qb-sep" />
          <Tooltip label="Smaller"><UnstyledButton className="toggle" onClick={() => setText({ style: { ...text.style, size: Math.max(4, (text.style.size ?? 8) - 1) } })}>A−</UnstyledButton></Tooltip>
          <span className="qb-size">{text.style.size ?? 8}</span>
          <Tooltip label="Larger"><UnstyledButton className="toggle" onClick={() => setText({ style: { ...text.style, size: (text.style.size ?? 8) + 1 } })}>A+</UnstyledButton></Tooltip>
          <UnstyledButton className={`toggle${text.style.bold ? ' on' : ''}`} onClick={() => setText({ style: { ...text.style, bold: !text.style.bold || undefined } })}><b>B</b></UnstyledButton>
          <UnstyledButton className={`toggle${text.style.italic ? ' on' : ''}`} onClick={() => setText({ style: { ...text.style, italic: !text.style.italic || undefined } })}><i>I</i></UnstyledButton>
          <Tooltip label="A box around it"><UnstyledButton className={`toggle${text.box !== 'none' ? ' on' : ''}`} onClick={() => setText({ box: text.box === 'none' ? 'border' : 'none' })}><BoxIcon key="border" box="border" /></UnstyledButton></Tooltip>
        </>
      )}
      <span className="qb-sep" />
      <Tooltip label="To the front"><ActionIcon size="sm" aria-label="To the front"><ArrowUpToLine size={14} /></ActionIcon></Tooltip>
      <Tooltip label="To the back"><ActionIcon size="sm" aria-label="To the back"><ArrowDownToLine size={14} /></ActionIcon></Tooltip>
      <Tooltip label="Remove it"><ActionIcon size="sm" color="red" aria-label="Remove"><Trash2 size={14} /></ActionIcon></Tooltip>
      <Tooltip label="Hide the quick bar (back: Quick bar, in the panel)"><ActionIcon size="sm" onClick={onHide} aria-label="Hide the quick bar"><X size={14} /></ActionIcon></Tooltip>
    </div>
  );
}

// ---- the buttons and fields: now and new ----
function Controls({ cls }: { cls: string }) {
  return (
    <div className={`ctl-demo ${cls}`}>
      <div className="demo-row">
        <button>Plain</button>
        <button className="active">Active</button>
        <button className="primary">Primary</button>
        <button className="danger">Remove</button>
        <button disabled>Disabled</button>
      </div>
      <div className="demo-row">
        <button className="icon" title="Copy"><Copy size={14} /></button>
        <button className="icon" title="Lock"><Lock size={14} /></button>
        <button className="btn-run">▶ Run</button>
        <span className="demo-group">
          <button>Left</button>
          <button className="active">Centre</button>
          <button>Right</button>
        </span>
      </div>
      <div className="demo-row">
        <select defaultValue="b"><option value="a">linear</option><option value="b">log</option></select>
        <input defaultValue="Wavelength (nm)" />
        <input type="number" defaultValue={0.75} className="num" />
        <label className="demo-check"><input type="checkbox" defaultChecked /> Grid</label>
      </div>
    </div>
  );
}

// ---- the page ----
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const QUICK = 'graph-flow:quick-bar';
function Lab() {
  const scheme = useScheme();
  const [themeChoice, setThemeChoice] = useState<Theme>(loadTheme);
  const [colors, setColors] = useState(loadColors);
  const [sel, setSel] = useState<Sel>('arrow');
  const [quick, setQuickState] = useState(() => {
    try {
      return localStorage.getItem(QUICK) !== 'off';
    } catch {
      return true;
    }
  });
  const setQuick = (b: boolean) => {
    setQuickState(b);
    try {
      localStorage.setItem(QUICK, b ? 'on' : 'off');
    } catch {
      // storage unavailable: for this visit
    }
  };
  const [arrow, setArrowState] = useState<ShapeSpec>({ ...SHAPE_DEFAULTS, kind: 'arrow', coords: 'data', x1: 455, y1: 0.86, x2: 508, y2: 0.95, color: '#D55E00', width: 1, headSize: 5 });
  const [text, setTextState] = useState<TextSpec>({ ...TEXT_SPEC_DEFAULTS, text: 'Plasmon band', coords: 'data', x: 452, y: 0.86, anchor: 'cr', style: {}, z: 2 });
  const [ao, setAo] = useState<Obj>({ name: '', hidden: false, locked: false });
  const [to, setTo] = useState<Obj>({ name: '', hidden: false, locked: false });
  const [xs, setXs] = useState<AxisSpec>({ ...AXIS_DEFAULTS });
  const [ys, setYs] = useState<AxisSpec>({ ...AXIS_DEFAULTS });
  const setArrow = (p: Partial<ShapeSpec>) => setArrowState((a) => ({ ...a, ...p }));
  const setText = (p: Partial<TextSpec>) => setTextState((t) => ({ ...t, ...p }));

  const fig = useMemo((): Figure | null => {
    const plot = {
      ...structuredClone(PLOT1D_DEFAULTS),
      cols: { x: 'Wavelength (nm)', y: 'Absorbance' },
      style: { ...PLOT1D_DEFAULTS.style, color: '#0072B2', lineWidth: 1.25 },
      legend: { show: false },
      axes: { x: xs, y: ys },
      annotations: [...(ao.hidden ? [] : [{ id: 'arrow', type: 'shape' as const, spec: arrow }]), ...(to.hidden ? [] : [{ id: 'label', type: 'text' as const, spec: text }])],
    };
    const nodes = [
      { id: 'lab-data', type: 'import', position: { x: 0, y: 0 }, data: { ...IMPORT_DEFAULTS, text: SPECTRUM, textId: 'lab' } },
      { id: 'lab-plot', type: 'plot1d', position: { x: 0, y: 0 }, data: plot },
    ] as AppNode[];
    const edges: Edge[] = [{ id: 'e', source: 'lab-data', sourceHandle: 'out', target: 'lab-plot', targetHandle: 'dataset' }];
    const out = evaluateGraph(nodes, edges).get('lab-plot')?.outputs.figure;
    return out?.t === 'figure' ? out.v : null;
  }, [arrow, text, xs, ys, ao.hidden, to.hidden]);

  // the axes as drawn (their scales) and as they would be left automatic
  const geo = useMemo(() => {
    if (!fig) return null;
    const ax = fig.axes[0];
    const W = toPt(fig.width, fig.unit);
    const H = toPt(fig.height, fig.unit);
    const p = ax.style.pos;
    const frame = { x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H };
    const g = axesGeometry(ax, frame, fig.text);
    const free = (s: AxisSpec): AxisSpec => ({ ...s, min: NaN, max: NaN, step: NaN, ticksBy: 'auto' });
    const a = axesGeometry({ ...ax, style: { ...ax.style, x: free(ax.style.x), y: free(ax.style.y) } }, frame, fig.text);
    const auto = (s: { lo: number; hi: number }, major: number[]) => ({ lo: s.lo, hi: s.hi, step: major.length > 1 ? +(major[1] - major[0]).toPrecision(6) : NaN });
    return { W, H, frame, g, autoX: auto(a.sBottom, a.tb.major), autoY: auto(a.sLeft, a.tl.major) };
  }, [fig]);

  const [figRef, figW] = useWidth<HTMLDivElement>();
  const scale = geo ? figW / geo.W : 1;
  // the selected object's box on screen
  const box = useMemo(() => {
    if (!geo) return null;
    const px = (x: number, y: number, coords: 'data' | 'percent') => coords === 'data' ? [geo.g.sBottom.f(x) * scale, geo.g.sLeft.f(y) * scale] : [(geo.frame.x + (x / 100) * geo.frame.w) * scale, (geo.frame.y + (y / 100) * geo.frame.h) * scale];
    const [ax1, ay1] = px(arrow.x1, arrow.y1, arrow.coords);
    const [ax2, ay2] = px(arrow.x2, arrow.y2, arrow.coords);
    const [tx, ty] = px(text.x, text.y, text.coords);
    const size = (text.style.size ?? fig?.text.size ?? 8) * scale;
    const lines = text.text.split('\n');
    const tw = Math.max(...lines.map((l) => l.length)) * size * 0.52;
    const th = lines.length * size * 1.2;
    const col = text.anchor.endsWith('l') ? 0 : text.anchor.endsWith('r') ? 1 : 0.5;
    const row = text.anchor.startsWith('t') ? 0 : text.anchor.startsWith('b') ? 1 : 0.5;
    const pad = 4;
    return {
      arrow: { x: Math.min(ax1, ax2) - pad, y: Math.min(ay1, ay2) - pad, w: Math.abs(ax2 - ax1) + 2 * pad, h: Math.abs(ay2 - ay1) + 2 * pad, seg: [ax1, ay1, ax2, ay2] },
      text: { x: tx - col * tw - pad, y: ty - row * th - pad, w: tw + 2 * pad, h: th + 2 * pad },
    };
  }, [geo, scale, arrow, text, fig]);
  const cur = box?.[sel];
  const pickAt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!box) return;
    const r = e.currentTarget.getBoundingClientRect();
    const [x, y] = [e.clientX - r.left, e.clientY - r.top];
    const [x1, y1, x2, y2] = box.arrow.seg;
    const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2 || 1)));
    const dA = Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1)));
    const b = box.text;
    const dT = x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h ? 0 : Infinity;
    if (dT < 12 || dA < 12) setSel(dT <= dA ? 'text' : 'arrow');
  };
  const page = { font: fig?.text.font ?? FONTS[0][0], size: fig?.text.size ?? 8, color: fig?.text.color ?? '#000000' };

  return (
    <MantineProvider theme={theme} cssVariablesResolver={resolver} forceColorScheme={scheme}>
      <div className="lab">
        <header className="lab-top">
          <div>
            <div className="lab-title">UI lab</div>
            <Text size="xs" c="dimmed">The new look, tried here before it goes into the app. Nothing here changes a project.</Text>
          </div>
          <div className="grow" />
          <Choice<Theme> full={false} value={themeChoice} onChange={(t) => (applyTheme(t), setThemeChoice(t))} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} />
          <div className="swatch-row">
            {SWATCHES.map((s) => (
              <Tooltip key={s.name} label={s.name}>
                <UnstyledButton className={`lab-accent${colors.select === s.light ? ' on' : ''}`} style={{ background: scheme === 'dark' ? s.dark : s.light }} onClick={() => { const c = { select: s.light, accent: 'same' }; applyColors(c); setColors(c); }} aria-label={s.name} />
              </Tooltip>
            ))}
          </div>
        </header>
        <Tabs defaultValue="props" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="props">Object properties</Tabs.Tab>
            <Tabs.Tab value="controls">Buttons and fields</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="props">
            <div className="lab-grid">
              <div className="lab-left">
                <div className="lab-hint">
                  <Text size="xs" c="dimmed">Click the arrow or the text on the figure to select it.</Text>
                </div>
                <div className="fig-card">
                  <div className="fig-wrap" ref={figRef} onClick={pickAt}>
                    {fig && geo && <FigureSvg fig={fig} display={{ width: figW, height: Math.round((figW * geo.H) / geo.W) }} idPrefix="lab" />}
                    {cur && <div className="sel-box" style={{ left: cur.x, top: cur.y, width: cur.w, height: cur.h }} />}
                    {quick && cur && <QuickBar sel={sel} arrow={arrow} setArrow={setArrow} text={text} setText={setText} at={{ x: Math.max(0, Math.min(figW - 340, cur.x)), y: Math.max(0, cur.y - 44) }} onHide={() => setQuick(false)} />}
                  </div>
                </div>
                <div className="axis-pair">
                  <AxisCard title="X axis" spec={xs} set={(p) => setXs((s) => ({ ...s, ...p }))} auto={geo?.autoX ?? null} />
                  <AxisCard title="Y axis" spec={ys} set={(p) => setYs((s) => ({ ...s, ...p }))} auto={geo?.autoY ?? null} />
                </div>
              </div>
              <div className="lab-right">
                {sel === 'arrow' ? (
                  <ArrowPanel key="arrow" s={arrow} set={setArrow} o={ao} setO={(p) => setAo((o) => ({ ...o, ...p }))} quick={quick} setQuick={setQuick} page={page} />
                ) : (
                  <TextPanel key="text" s={text} set={setText} o={to} setO={(p) => setTo((o) => ({ ...o, ...p }))} quick={quick} setQuick={setQuick} page={page} />
                )}
              </div>
            </div>
          </Tabs.Panel>
          <Tabs.Panel value="controls">
            <div className="ctl-compare">
              <section>
                <h3>Now</h3>
                <Controls cls="ui-old" />
              </section>
              <section>
                <h3>New</h3>
                <Controls cls="ui-new" />
                <Text size="xs" c="dimmed" mt={8}>The same buttons of the app, the same size and place: only their look changes.</Text>
              </section>
              <section className="wide">
                <h3>New panels (Mantine)</h3>
                <div className="demo-row">
                  <Button>Primary</Button>
                  <Button variant="default">Default</Button>
                  <Button variant="light">Light</Button>
                  <Button variant="subtle">Subtle</Button>
                  <Button variant="default" color="red" c="red">Remove</Button>
                  <Button disabled>Disabled</Button>
                  <Checkbox label="Grid" defaultChecked />
                  <Switch label="Snap" defaultChecked />
                </div>
                <div className="demo-row">
                  <Select w={140} data={['linear', 'log', 'reciprocal']} defaultValue="log" />
                  <TextInput w={180} defaultValue="Wavelength (nm)" />
                  <NumberInput w={90} defaultValue={0.75} step={0.25} />
                </div>
              </section>
            </div>
          </Tabs.Panel>
        </Tabs>
      </div>
    </MantineProvider>
  );
}

export default Lab;
