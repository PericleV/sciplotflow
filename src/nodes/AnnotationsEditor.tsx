// The annotations of a Plot (on its frame: in the units of the data or % of the frame) or of a Merge (% of the page),
// as a list: texts and callouts, lines and arrows (straight or bent), shapes (rectangles, ellipses, polygons, stars,
// regular polygons, arcs, pie and donut slices), bands, brackets and braces (in any direction), scale bars, colour bars. What each
// one is comes from the button that added it (only its close variants can be chosen after). Each has its own layer;
// they are dragged on the figure, with handles for their points, bends, legs and turning.
// The settings of one (also of an object of a Figure Drawing): the same sections in the same order for every kind —
// its own (Arrow, Star …), Text, Line, Fill, Position, Effects, More —, each kind showing those it has.
import { useState, type ReactNode } from 'react';
import { Button, Select as MSelect, TextInput as MTextInput, Textarea, Tooltip, ActionIcon, Group } from '@mantine/core';
import { pageText, shapeSpec } from '../engine/evaluate.ts';
import { PageTextContext } from '../ui/pageText.ts';
import { setQuickBar, useQuickBar } from '../ui/quickBarStore.ts';
import { COLORBAR_DEFAULTS, TEXT_SPEC_DEFAULTS, type Anchor, type ArrowBody, type ArrowHead, type ColorbarSpec, type Hatch, type LabelFormat, type ShapeKind, type ShapeSpec, type TextSpec } from '../figure/spec.ts';
import { newAnnotation } from '../defaults.ts';
import type { AnnotationItem, PageData } from '../types.ts';
import { HATCHES } from './figureOptions.ts';
import { setShapePlacing, useShapePlacing } from './placeStore.ts';
import { RichInput } from './fields.tsx';
import { GradientRows } from '../ui/GradientRows.tsx';
import { HatchRows } from '../ui/HatchRows.tsx';
import { ArrowRightLeft, ChevronDown, ChevronRight, ImageUp, Link, Minus, MousePointerClick, Plus, Unlink } from 'lucide-react';
import { describe } from './annotationNames.ts';
import { bendPoints, bendText, bentLine, type Elbow, type Pt } from '../figure/shapes.ts';
import { Copy, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { IMAGE_ACCEPT, imageUrl } from '../imageFile.ts';
import { AnchorField, AngleField, Choice, ColorField, LayerRow, ListField, NumField, NumPair, OpacityField, PictureGrid, PicturePick, Row, Section, Sections, ShadowRows, SliderField, TextStyleRows, Toggle, WidthField } from '../ui/props.tsx';
import { BodyIcon, BoxIcon, CapIcon, HeadIcon, JoinIcon, RouteIcon } from '../ui/propIcons.tsx';
import { DASH_PICS } from '../ui/dashPics.tsx';
import { notify } from '../ui/dialogStore.ts';

// where: on the frame of a Plot (data units or % of the frame), on the page of a Merge (% of the page), or an object of
// a Figure Drawing (mm, its layer the order of its objects)
export type Where = 'frame' | 'page' | 'drawing';
const unitOf = (coords: 'data' | 'percent', where: Where) => (where === 'drawing' ? 'mm' : coords === 'percent' || where === 'page' ? '%' : '');

function CoordsRow({ coords, onChange, where }: { coords: 'data' | 'percent'; onChange: (c: 'data' | 'percent') => void; where: Where }) {
  if (where !== 'frame') return null;
  return (
    <Row label="Units" hint="In the units of the data (it stays on its point when the limits change), or in % of the frame">
      <Choice
        value={coords}
        onChange={onChange}
        options={[
          ['data', 'Data'],
          ['percent', '% of frame'],
        ]}
      />
    </Row>
  );
}

// keys pressed in a panel (on its sliders, buttons, pickers) are its own: not the editor's around it (an arrow key moving
// the object, Delete removing it, Escape leaving); with Ctrl / Cmd / Alt they go on (undo, redo)
const ownKeys = (e: React.KeyboardEvent) => {
  if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
};

// the close variants a shape can turn into (the same points)
const VARIANTS: Partial<Record<ShapeKind, [ShapeKind, string][]>> = {
  line: [
    ['line', 'Line'],
    ['arrow', 'Arrow'],
  ],
  rect: [
    ['rect', 'Rectangle'],
    ['ellipse', 'Ellipse'],
  ],
  star: [
    ['star', 'Star'],
    ['regular', 'Regular polygon'],
  ],
  vline: [
    ['vline', 'Vertical'],
    ['hline', 'Horizontal'],
  ],
};
const variantsOf = (k: ShapeKind) => VARIANTS[k] ?? Object.values(VARIANTS).find((v) => v.some(([x]) => x === k));
// an arc's variants: the open arc, a pie slice (a sector, as older projects have it), a donut's (a sector with a hole)
const arcKind = (s: ShapeSpec) => (!s.sector ? 'arc' : (s.hole ?? 0) > 0 ? 'donut' : 'pie');
// how far it opens from a1 (degrees, counter-clockwise; a whole turn 360)
const arcSpan = (s: ShapeSpec) => {
  const [a1, a2] = [s.a1 ?? 0, s.a2 ?? 90];
  const span = (((a2 - a1) % 360) + 360) % 360;
  return span === 0 && a1 !== a2 ? 360 : span;
};

// the title of a kind's own section
const KIND_TITLE: Record<ShapeKind, string> = {
  line: 'Line',
  arrow: 'Arrow',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  xband: 'Band',
  yband: 'Band',
  vline: 'Line',
  hline: 'Line',
  bracket: 'Bracket',
  star: 'Star',
  regular: 'Regular polygon',
  arc: 'Arc',
  callout: 'Callout',
  scalebar: 'Scale bar',
  dimension: 'Dimension',
  path: 'Path',
  image: 'Picture',
  component: 'Component',
};

const HEAD_NAMES: [ArrowHead, string][] = [
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
const headPics = (start: boolean) => HEAD_NAMES.map(([h, n]): [ArrowHead, ReactNode, string] => [h, <HeadIcon key={h} head={h} start={start} />, n]);

// the heads of a line (its start, its end, swapped) and their size
function HeadRows({ s, set, start = true, label = 'Heads', sizeLabel = 'Head size' }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void; start?: boolean; label?: string; sizeLabel?: string }) {
  const num = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0);
  return (
    <>
      <Row label={label} hint={start ? (s.kind === 'path' ? 'At its first node (an open path only) and at its end' : 'At the start and at the end') : 'At the point'}>
        <Group gap={6} wrap="nowrap">
          {start && <PicturePick label="Head at start" value={s.head1} onChange={(head1) => set({ head1 })} options={headPics(true)} />}
          {start && (
            <Tooltip label="Swap the heads">
              <ActionIcon variant="subtle" onClick={() => set({ head1: s.head2, head2: s.head1 })} aria-label="Swap the heads">
                <ArrowRightLeft size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <PicturePick label={start ? 'Head at end' : 'Head at the point'} value={s.head2} onChange={(head2) => set({ head2 })} options={headPics(false)} />
        </Group>
      </Row>
      <Row label={sizeLabel}>
        <SliderField value={s.headSize} onChange={(v) => set({ headSize: num(v) })} min={0} max={15} step={0.5} unit="pt" />
      </Row>
      {start && (
        <Row label="Along it" hint="Heads along the line too (a flow, a cycle): so many, evenly along it, pointing its way or back">
          <Group gap={6} wrap="nowrap">
            <PicturePick label="Head along the line" value={s.headMid ?? 'none'} onChange={(headMid) => set({ headMid: headMid === 'none' ? undefined : headMid })} options={headPics(false)} />
            {s.headMid && s.headMid !== 'none' && (
              <>
                <NumField value={s.midCount ?? 1} min={1} max={20} step={1} onChange={(v) => set({ midCount: Number.isFinite(v) && v > 1 ? Math.min(20, Math.round(v)) : undefined })} />
                <Toggle label="back" value={!!s.midBack} onChange={(midBack) => set({ midBack: midBack || undefined })} />
              </>
            )}
          </Group>
        </Row>
      )}
    </>
  );
}

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

// A line's or arrow's route (as a line, or an elbow), its bend or the points it goes through, its body (and what each
// needs), crossed out.
function ArrowShape({ s, set, unit }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void; unit: string }) {
  const body = s.body ?? 'single';
  const gapped = body === 'double' || body === 'retro' || body.startsWith('eq');
  const route = s.route ?? 'line';
  // a line's bends: a new one in the middle of its longest piece (the first one: where the bent line's middle is)
  const bends = bendPoints(s.bends);
  const addBend = () => {
    const p1: Pt = [s.x1, s.y1];
    const p2: Pt = [s.x2, s.y2];
    if (!bends.length) return set({ bends: bendText([bentLine(p1, p2, s.curve ?? 0, 0, 0).mid]), curve: undefined });
    const pts = [p1, ...bends, p2];
    let at = 0;
    for (let k = 1; k < pts.length - 1; k++) if (Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) > Math.hypot(pts[at + 1][0] - pts[at][0], pts[at + 1][1] - pts[at][1])) at = k;
    const mid: Pt = [(pts[at][0] + pts[at + 1][0]) / 2, (pts[at][1] + pts[at + 1][1]) / 2];
    set({ bends: bendText([...bends.slice(0, at), mid, ...bends.slice(at)]) });
  };
  return (
    <>
      <Row label="Route" hint="A line (straight, bent, or through points), or an elbow: across then down, down then across, across–down–across, down–across–down (its middle piece dragged by its handle)">
        <PictureGrid value={route} onChange={(r) => set({ route: r === 'line' ? undefined : r })} options={ROUTES.map(([r, n]) => [r, <RouteIcon key={r} route={r} />, n])} cols={5} />
      </Row>
      {route === 'line' && (
        <>
          {!bends.length && (
            <Row label="Bend" hint="0: straight; either way: its middle pushed to that side (also: drag the handle in its middle)">
              <SliderField value={s.curve ?? 0} onChange={(v) => set({ curve: Number.isFinite(v) && v !== 0 ? v : undefined })} min={-1} max={1} step={0.05} marks={[0]} />
            </Row>
          )}
          <Row label="Through" hint="Points the line goes through (several: a smooth curve through them all), dragged on the figure">
            <div className="prop-btns">
              <Button variant="default" leftSection={<Plus size={13} />} onClick={addBend} title="Another point the line goes through: in the middle of its longest piece (then drag it on the figure)">
                {bends.length ? `${bends.length} point${bends.length > 1 ? 's' : ''}: add` : 'Add a point'}
              </Button>
              {bends.length > 0 && (
                <Button variant="default" leftSection={<Minus size={13} />} onClick={() => set({ bends: bends.length > 1 ? bendText(bends.slice(0, -1)) : undefined })} title="The last point taken away">
                  Remove
                </Button>
              )}
            </div>
            {bends.length > 0 && <MTextInput value={s.bends ?? ''} placeholder="x y; x y" title={`The points the line goes through, in order: x y; x y … ${unit ? `(${unit})` : '(in its units)'}`} onChange={(e) => set({ bends: e.currentTarget.value.trim() ? e.currentTarget.value : undefined })} />}
          </Row>
        </>
      )}
      {route !== 'line' && (
        <Row label="Corners" hint="Its corners rounded, pt">
          <SliderField value={s.radius} onChange={(v) => set({ radius: Math.max(0, Number.isFinite(v) ? v : 0) })} min={0} max={20} step={0.5} unit="pt" />
        </Row>
      )}
      <Row label="Body" hint="One line, two, tapered, a wave or zigzag; chemistry: an equilibrium ⇌ (two harpoons; favouring a side: that one longer), a retrosynthetic arrow ⇒">
        <PicturePick label="Body" value={body} onChange={(b) => set({ body: b === 'single' ? undefined : b })} options={BODIES.map(([b, n]) => [b, <BodyIcon key={b} body={b} />, n])} />
      </Row>
      {gapped && (
        <Row label="Gap" hint="Between its two lines">
          <SliderField value={s.gap ?? Math.max(2, s.headSize * 0.5)} onChange={(v) => set({ gap: v > 0 ? v : undefined })} min={0.5} max={12} step={0.25} unit="pt" />
        </Row>
      )}
      {body === 'tapered' && (
        <Row label="Start width" hint="Its width at the start (at its end: the line's width)">
          <SliderField value={s.width2 ?? 0} onChange={(v) => set({ width2: Math.max(0, v || 0) })} min={0} max={10} step={0.25} unit="pt" />
        </Row>
      )}
      {(body === 'wavy' || body === 'zigzag') && (
        <>
          <Row label="Wave height" hint="How far the wave goes either side">
            <SliderField value={s.amp ?? 2} onChange={(v) => set({ amp: v > 0 ? v : undefined })} min={0.25} max={10} step={0.25} unit="pt" />
          </Row>
          <Row label="Wave length" hint="How long one wave is">
            <SliderField value={s.wave ?? 6} onChange={(v) => set({ wave: v > 0 ? v : undefined })} min={1} max={30} step={0.5} unit="pt" />
          </Row>
        </>
      )}
      <Row label="Crossed out" hint="A cross in its middle: the reaction does not happen">
        <Toggle value={!!s.cross} onChange={(cross) => set({ cross: cross || undefined })} />
      </Row>
    </>
  );
}

// The texts above and below a line or arrow, their look, where along it, how far, which way.
function ArrowLabels({ s, set }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void }) {
  return (
    <>
      <Row label="Above" hint="Over the line (a line going up or down: at its right), e.g. the reagents">
        <RichInput value={s.text} placeholder="none" onChange={(text) => set({ text })} />
      </Row>
      <Row label="Below" hint="Under the line (going up or down: at its left), e.g. the conditions">
        <RichInput value={s.text2 ?? ''} placeholder="none" onChange={(text2) => set({ text2: text2 || undefined })} />
      </Row>
      {(!!s.text || !!s.text2) && (
        <>
          <TextStyleRows value={s.textStyle} onChange={(textStyle) => set({ textStyle })} />
          <Row label="Where" hint="Along the line: 0 % its start, 50 % its middle, 100 % its end">
            <SliderField value={Math.round((s.labelAt ?? 0.5) * 1000) / 10} onChange={(v) => set({ labelAt: Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : undefined })} min={0} max={100} step={1} unit="%" marks={[50]} />
          </Row>
          <Row label="Gap" hint="Between the line and its texts">
            <SliderField value={s.textGap ?? 1.5} onChange={(v) => set({ textGap: Math.max(0, v || 0) })} min={0} max={10} step={0.25} unit="pt" />
          </Row>
          <Row label="Direction">
            <Choice<'along' | 'level'>
              value={s.textDir === 'level' ? 'level' : 'along'}
              onChange={(textDir) => set({ textDir })}
              options={[
                ['along', 'Along it', 'Along the line (kept readable)'],
                ['level', 'Level'],
              ]}
            />
          </Row>
        </>
      )}
    </>
  );
}

// A rectangle's rounded corners: one radius for all, or (unlinked) one for each corner (pt).
function CornerRadii({ s, set }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void }) {
  const r = (s.radii ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const own = r.length === 4 && r.every(Number.isFinite);
  const names = ['top left', 'top right', 'bottom right', 'bottom left'];
  return (
    <Row label="Corners" hint="Rounded corners, pt: one radius for all, or (unlinked) one for each">
      <Group gap={6} wrap="nowrap" align="flex-start">
        <div className="grow">
          {own ? (
            <div className="prop-pair">
              {r.map((v, i) => (
                <NumField
                  key={i}
                  value={v}
                  min={0}
                  step={0.5}
                  prefix={['↖', '↗', '↘', '↙'][i]}
                  unit="pt"
                  onChange={(x) => {
                    const q = r.slice();
                    q[i] = Math.max(0, Number.isFinite(x) ? x : 0);
                    set({ radii: q.join(' ') });
                  }}
                  placeholder={names[i]}
                />
              ))}
            </div>
          ) : (
            <SliderField value={s.radius} onChange={(v) => set({ radius: Math.max(0, Number.isFinite(v) ? v : 0) })} min={0} max={20} step={0.5} unit="pt" />
          )}
        </div>
        <Tooltip label={own ? 'One radius for all the corners' : 'A radius for each corner'}>
          <ActionIcon variant="default" size="input-xs" onClick={() => set(own ? { radii: undefined, radius: r[0] } : { radii: Array(4).fill(s.radius || 0).join(' ') })} aria-label={own ? 'One radius for all' : 'A radius for each corner'}>
            {own ? <Unlink size={14} /> : <Link size={14} />}
          </ActionIcon>
        </Tooltip>
      </Group>
    </Row>
  );
}

// the bracket's directions
const ORIENTS: [NonNullable<ShapeSpec['orient']>, ReactNode, string][] = [
  ['down', '⊓', 'over x, legs down'],
  ['up', '⊔', 'under x, legs up'],
  ['left', ']', 'beside y, legs left'],
  ['right', '[', 'beside y, legs right'],
  ['free', '⟋', 'free, any direction'],
];

export function ShapeEditor({ s, set, where, placing, onPlace }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void; where: Where; placing?: boolean; onPlace?: () => void }) {
  const num = (v: number, min = 0) => Math.max(min, Number.isFinite(v) ? v : min);
  const k = s.kind;
  const open = k === 'polygon' && s.closed === false;
  const closed = k === 'rect' || k === 'ellipse' || k === 'star' || k === 'regular' || (k === 'arc' && !!s.sector) || (k === 'polygon' && !open) || k === 'callout' || k === 'path';
  const band = k === 'xband' || k === 'yband';
  const turns = k === 'rect' || k === 'ellipse' || k === 'star' || k === 'regular' || k === 'arc' || k === 'polygon' || k === 'path' || k === 'image' || k === 'bracket';
  const unit = unitOf(s.coords, where);
  const variants = variantsOf(k);
  const o = s.orient ?? 'down';
  const drawing = where === 'drawing';
  // the field of dashes of one's own shown (Style ▸ Own), also while it is empty
  const [ownDash, setOwnDash] = useState(false);
  const headed = k === 'line' || k === 'arrow' || k === 'dimension' || k === 'path' || open;
  const pair = (label: string, a: 'x1' | 'x2' | 'y1' | 'y2', b: 'x1' | 'x2' | 'y1' | 'y2', hint?: string, names?: [string, string]) => (
    <Row label={label} hint={hint}>
      <NumPair a={s[a]} b={s[b]} onA={(v) => set({ [a]: v })} onB={(v) => set({ [b]: v })} unit={unit} names={names} />
    </Row>
  );
  const at = (axis: 'x1' | 'y1') => (
    <Row label={axis === 'x1' ? 'At x' : 'At y'}>
      <NumField value={s[axis]} onChange={(v) => set({ [axis]: v })} unit={unit} />
    </Row>
  );

  // ---- its own section ----
  const own = (
    <>
      {variants && (
        <Row label="Kind">
          <Choice value={k} options={variants} onChange={(kind) => set({ kind, ...(kind === 'line' ? { head2: 'none' } : kind === 'arrow' ? { head2: s.head2 === 'none' ? 'triangle' : s.head2 } : {}) })} />
        </Row>
      )}
      {headed && <HeadRows s={s} set={set} />}
      {(k === 'line' || k === 'arrow') && <ArrowShape s={s} set={set} unit={unit} />}
      {k === 'dimension' && (
        <>
          <Row label="Offset" hint="From the points to the dimension line (−: the other side; also: drag the handle in its middle)">
            <SliderField value={s.offset ?? 8} onChange={(v) => set({ offset: Number.isFinite(v) ? v : 8 })} min={-40} max={40} step={0.5} unit="pt" marks={[0]} />
          </Row>
          <Row label="Decimals" hint="The length written with so many decimals">
            <Choice<string> value={String(s.dec ?? 1)} onChange={(v) => set({ dec: Math.max(0, Math.min(6, Math.round(Number(v)) || 0)) })} options={['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, d])} />
          </Row>
          <Row label="Unit" hint="Written after the length (in a drawing the length is in mm)">
            <MTextInput value={s.unit ?? ''} placeholder="none" onChange={(e) => set({ unit: e.currentTarget.value || undefined })} />
          </Row>
        </>
      )}
      {k === 'rect' && (drawing ? <CornerRadii s={s} set={set} /> : (
        <Row label="Corners" hint="Rounded corners, pt">
          <SliderField value={s.radius} onChange={(v) => set({ radius: num(v) })} min={0} max={20} step={0.5} unit="pt" />
        </Row>
      ))}
      {(k === 'star' || k === 'regular') && (
        <>
          <Row label={k === 'star' ? 'Points' : 'Sides'}>
            <SliderField value={s.n ?? (k === 'star' ? 5 : 6)} onChange={(v) => set({ n: Math.max(3, Math.min(64, Math.round(v) || 5)) })} min={3} max={24} step={1} />
          </Row>
          {k === 'star' && (
            <Row label="Inner size" hint="The inner corners, as a part of the size (0.38: the usual five-pointed star)">
              <SliderField value={s.inner ?? 0.382} onChange={(v) => set({ inner: Math.max(0.05, Math.min(1, v || 0.382)) })} min={0.05} max={1} step={0.01} />
            </Row>
          )}
        </>
      )}
      {k === 'arc' && (
        <>
          <Row label="Kind" hint="An arc (an open line), a pie slice (closed to the centre) or a donut's (a hole in its middle)">
            <Choice<'arc' | 'pie' | 'donut'>
              value={arcKind(s)}
              onChange={(v) => set(v === 'arc' ? { sector: undefined } : v === 'pie' ? { sector: true, hole: undefined } : { sector: true, hole: s.hole || 50 })}
              options={[
                ['arc', 'Arc'],
                ['pie', 'Pie'],
                ['donut', 'Donut'],
              ]}
            />
          </Row>
          <Row label="From" hint="Degrees, 0 to the right, counter-clockwise">
            <SliderField value={s.a1 ?? 0} onChange={(v) => set({ a1: Number.isFinite(v) ? v : 0 })} min={-360} max={360} step={1} unit="°" marks={[0]} />
          </Row>
          <Row label="To" hint="Degrees, 0 to the right, counter-clockwise">
            <SliderField value={s.a2 ?? 90} onChange={(v) => set({ a2: Number.isFinite(v) ? v : 90 })} min={-360} max={360} step={1} unit="°" marks={[0]} />
          </Row>
          <Row label="Opening" hint="From From, counter-clockwise (sets To)">
            <SliderField value={arcSpan(s)} onChange={(v) => set({ a2: (s.a1 ?? 0) + (Number.isFinite(v) ? Math.max(0, Math.min(360, v)) : 90) })} min={0} max={360} step={1} unit="°" />
          </Row>
          {arcKind(s) === 'donut' && (
            <Row label="Hole" hint="Its middle left out, % of its size">
              <SliderField value={s.hole ?? 50} onChange={(v) => set({ hole: Math.max(1, Math.min(95, Number.isFinite(v) ? v : 50)) })} min={1} max={95} step={1} unit="%" />
            </Row>
          )}
          {s.sector && (
            <Row label="Corners" hint="Rounded corners, pt (at most what the slice has room for)">
              <SliderField value={s.radius} onChange={(v) => set({ radius: num(v) })} min={0} max={20} step={0.5} unit="pt" />
            </Row>
          )}
        </>
      )}
      {k === 'polygon' && (
        <>
          <Row label="Points" hint={`x y; x y; … ${unit ? `(${unit})` : '(in the units chosen in Position)'}, or placed with the mouse`}>
            <MTextInput value={s.points} placeholder="x y; x y; x y" onChange={(e) => set({ points: e.currentTarget.value })} />
            {onPlace && (
              <Button variant={placing ? 'filled' : 'default'} leftSection={<MousePointerClick size={13} />} onClick={onPlace} title="Click on the figure: a point each click, drag one to move it, double-click to remove it (again: stop)">
                {placing ? 'Placing: click to stop' : 'Place on the figure'}
              </Button>
            )}
          </Row>
          <Row label="Outline" hint="Closed: a shape (filled); open: a line through the points (with heads at its ends)">
            <Choice<'closed' | 'open'>
              value={open ? 'open' : 'closed'}
              onChange={(v) => set({ closed: v === 'closed' })}
              options={[
                ['closed', 'Closed'],
                ['open', 'Open'],
              ]}
            />
          </Row>
          <Row label="Smooth" hint="A smooth curve through the points">
            <Toggle value={!!s.smooth} onChange={(smooth) => set({ smooth })} />
          </Row>
        </>
      )}
      {k === 'path' && (
        <>
          <Row label="Outline" hint="Its outline as SVG path text, in its units (M, L, H, V, C, S, Q, T, A, Z): edit it or paste one; on the figure: its nodes dragged (double-click one: removed; Alt + click: smooth / corner; double-click the path: a node there)">
            <Textarea className="mono-input" autosize minRows={2} maxRows={6} value={s.d ?? ''} placeholder="M 0 0 L 10 0 …" onChange={(e) => set({ d: e.currentTarget.value })} />
          </Row>
          <Row label="Holes" hint="Where it crosses itself or one part is inside another: holes by the even-odd rule (else by the direction of each part)">
            <Toggle value={!!s.evenodd} onChange={(evenodd) => set({ evenodd: evenodd || undefined })} label="by even-odd" />
          </Row>
        </>
      )}
      {k === 'image' && (
        <>
          <Row label="Stretched" hint="Filling its box (else its proportions kept, in the middle of the box)">
            <Toggle value={!!s.stretch} onChange={(stretch) => set({ stretch: stretch || undefined })} />
          </Row>
          <Row label="Picture">
            <Button
              variant="default"
              leftSection={<ImageUp size={13} />}
              title="Another picture in its place (PNG, JPEG, TIFF, SVG …)"
              onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = IMAGE_ACCEPT;
                inp.onchange = () => {
                  const f = inp.files?.[0];
                  if (f) void imageUrl(f).then((href) => set({ href }), (e: Error) => notify(`${f.name}: ${e.message}`));
                };
                inp.click();
              }}
            >
              Replace picture…
            </Button>
          </Row>
        </>
      )}
      {k === 'callout' && (
        <>
          <HeadRows s={s} set={set} start={false} label="Head" />
          <Row label="Corners" hint="Rounded corners of its box, pt">
            <SliderField value={s.radius} onChange={(v) => set({ radius: num(v) })} min={0} max={20} step={0.5} unit="pt" />
          </Row>
          <Row label="Padding" hint="The room around the text, pt">
            <SliderField value={s.pad ?? 2} onChange={(v) => set({ pad: num(v) })} min={0} max={15} step={0.5} unit="pt" />
          </Row>
        </>
      )}
      {k === 'scalebar' && (
        <>
          <Row label="Length" hint="In the units of the data along x (vertical: along y); empty: a round length, about a fifth of the frame (also: drag its end)">
            <NumField value={s.len ?? NaN} min={0} placeholder="auto" onChange={(v) => set({ len: v > 0 ? v : undefined })} />
          </Row>
          <Row label="Vertical">
            <Toggle value={!!s.vertical} onChange={(vertical) => set({ vertical: vertical || undefined })} />
          </Row>
          <Row label="End ticks" hint="Their length, pt">
            <SliderField value={s.headSize} onChange={(v) => set({ headSize: num(v) })} min={0} max={15} step={0.5} unit="pt" />
          </Row>
        </>
      )}
      {k === 'bracket' && (
        <>
          <Row label="Direction" hint="Over or under a range of x, beside a range of y, or free: from one point to another in any direction">
            <PictureGrid value={o} onChange={(orient) => set({ orient })} options={ORIENTS} cols={5} />
          </Row>
          <Row label="Style">
            <Choice<NonNullable<ShapeSpec['bstyle']>>
              value={s.bstyle ?? 'square'}
              onChange={(bstyle) => set({ bstyle })}
              options={[
                ['square', '⊓ Square'],
                ['curly', '⏞ Brace'],
                ['bar', '├┤ Bar'],
              ]}
            />
          </Row>
          {s.bstyle === 'curly' ? (
            <Row label="Depth" hint="pt (also: drag the handle at its end)">
              <SliderField value={s.headSize} onChange={(v) => set({ headSize: num(v) })} min={0} max={20} step={0.5} unit="pt" />
            </Row>
          ) : (
            <>
              <Row label={s.bstyle === 'bar' ? 'Start end' : 'Start leg'} hint="pt (also: drag the handle at the first one)">
                <SliderField value={s.headSize} onChange={(v) => set({ headSize: num(v) })} min={0} max={20} step={0.5} unit="pt" />
              </Row>
              <Row label={s.bstyle === 'bar' ? 'Last end' : 'Last leg'} hint="pt">
                <SliderField value={s.leg2 ?? s.headSize} onChange={(v) => set({ leg2: num(v) })} min={0} max={20} step={0.5} unit="pt" />
              </Row>
            </>
          )}
          {o === 'free' && (
            <Row label="Legs" hint="On which side of the line its legs are">
              <Toggle value={!!s.flip} onChange={(flip) => set({ flip: flip || undefined })} label="on the other side" />
            </Row>
          )}
        </>
      )}
    </>
  );
  const hasOwn = !!variants || k !== 'xband' && k !== 'yband' && k !== 'ellipse';

  // ---- text ----
  const textB =
    k === 'line' || k === 'arrow' ? (
      <ArrowLabels s={s} set={set} />
    ) : k === 'bracket' || k === 'callout' || k === 'scalebar' || k === 'dimension' ? (
      <>
        <Row label={k === 'scalebar' ? 'Label' : 'Text'} hint={k === 'dimension' ? 'Empty: the length measured; else this text' : undefined}>
          <RichInput multiline={k === 'callout'} value={s.text} placeholder={k === 'bracket' ? 'e.g. ***, p < 0.01' : k === 'scalebar' ? 'the length (e.g. 100 nm)' : k === 'dimension' ? 'the length' : 'Text (Enter: a new line)'} onChange={(text) => set({ text })} />
        </Row>
        <TextStyleRows value={s.textStyle} onChange={(textStyle) => set({ textStyle })} />
        {k === 'bracket' && (
          <>
            <Row label="Gap" hint="Between the bracket and its text">
              <SliderField value={s.textGap ?? 1.5} onChange={(v) => set({ textGap: num(v) })} min={0} max={10} step={0.25} unit="pt" />
            </Row>
            <Row label="Direction" hint="Along the bracket (kept readable), level, or at an angle (clockwise)">
              <Choice<NonNullable<ShapeSpec['textDir']>>
                value={s.textDir ?? 'along'}
                onChange={(textDir) => set({ textDir })}
                options={[
                  ['along', 'Along it'],
                  ['level', 'Level'],
                  ['angle', 'Angle'],
                ]}
              />
              {s.textDir === 'angle' && <AngleField value={s.textAngle ?? 0} onChange={(v) => set({ textAngle: Number.isFinite(v) ? v : 0 })} />}
            </Row>
          </>
        )}
        {k === 'dimension' && (
          <Row label="Direction">
            <Choice<'along' | 'level'>
              value={s.textDir === 'level' ? 'level' : 'along'}
              onChange={(textDir) => set({ textDir })}
              options={[
                ['along', 'Along it', 'Along the line (kept readable)'],
                ['level', 'Level'],
              ]}
            />
          </Row>
        )}
      </>
    ) : null;

  // ---- line ----
  const line = !band && (
    <>
      <Row label="Colour">
        <ColorField value={s.color} onChange={(color) => set({ color: color || '#000000' })} />
      </Row>
      <Row label="Width">
        <WidthField value={s.width} onChange={(v) => set({ width: num(v) })} />
      </Row>
      <Row label="Style" hint="Its dashes; Own: dashes of your own">
        <PictureGrid
          value={ownDash || s.dashPattern ? 'own' : s.dash}
          onChange={(d) => {
            if (d === 'own') return (setOwnDash(true), set({ dashPattern: s.dashPattern ?? '6 2 1 2' }));
            setOwnDash(false);
            set({ dash: d, dashPattern: undefined });
          }}
          options={[...DASH_PICS, ['own', <span key="own" className="pic-word">Own</span>, 'dashes of your own']]}
          cols={4}
        />
        {(ownDash || !!s.dashPattern) && (
          <MTextInput value={s.dashPattern ?? ''} placeholder="e.g. 6 2 1 2" title="In pt: a dash, a gap, a dash, a gap … (e.g. 6 2 1 2: long dash, gap, dot, gap)" onChange={(e) => set({ dashPattern: e.currentTarget.value.trim() ? e.currentTarget.value : undefined })} />
        )}
      </Row>
      <Row label="Opacity">
        <OpacityField value={s.opacity} onChange={(v) => set({ opacity: Math.min(1, num(v)) })} />
      </Row>
      <Row label="Ends" hint="The ends of the lines: flat, round, square">
        <Choice<NonNullable<ShapeSpec['cap']>>
          value={s.cap ?? 'butt'}
          onChange={(cap) => set({ cap })}
          options={[
            ['butt', <span key="butt" className="seg-pic"><CapIcon cap="butt" />Flat</span>, 'The line stops at its end'],
            ['round', <span key="round" className="seg-pic"><CapIcon cap="round" />Round</span>, 'A half circle past its end'],
            ['square', <span key="square" className="seg-pic"><CapIcon cap="square" />Square</span>, 'Half its width past its end'],
          ]}
        />
      </Row>
      <Row label="Joins" hint="How the lines meet at a corner: sharp, round, cut">
        <Choice<NonNullable<ShapeSpec['join']>>
          value={s.join ?? 'miter'}
          onChange={(join) => set({ join })}
          options={[
            ['miter', <span key="miter" className="seg-pic"><JoinIcon join="miter" />Sharp</span>, 'A pointed corner'],
            ['round', <span key="round" className="seg-pic"><JoinIcon join="round" />Round</span>, 'A rounded corner'],
            ['bevel', <span key="bevel" className="seg-pic"><JoinIcon join="bevel" />Cut</span>, 'The corner cut off'],
          ]}
        />
      </Row>
      {(s.join ?? 'miter') === 'miter' && (
        <Row label="Sharp limit" hint="A very sharp corner sticks out far: at most this many times the line's width, beyond it is cut (4 by default)">
          <SliderField value={s.miter ?? 4} onChange={(v) => set({ miter: v >= 1 && v !== 4 ? v : undefined })} min={1} max={10} step={0.5} unit="×" />
        </Row>
      )}
    </>
  );

  // ---- fill: its colour and opacity; a gradient (GradientRows); a hatching ----
  const fill = (closed || band) && (
    <>
      {band && (
        <Row label="Colour">
          <ColorField value={s.color} onChange={(color) => set({ color: color || '#000000' })} />
        </Row>
      )}
      <Row label="Fill" hint={band ? 'Its colour (auto: the colour above)' : 'Its colour (none: not filled)'}>
        <ColorField value={s.fill} none={!band} auto={band ? s.color : undefined} onChange={(f) => set({ fill: f })} />
      </Row>
      <Row label="Opacity">
        <OpacityField value={s.fillOpacity} onChange={(v) => set({ fillOpacity: Math.min(1, num(v)) })} />
      </Row>
      <GradientRows g={s} from={s.fill || s.color} set={set} />
      <Row label="Hatching" hint="A hatching over the fill: its kind and colour">
        <MSelect value={s.hatch ?? 'none'} data={HATCHES.map(([v, l]) => ({ value: v, label: l }))} onChange={(h) => h && set({ hatch: h as Hatch })} />
      </Row>
      {s.hatch && s.hatch !== 'none' && (
        <>
          <Row label="Its colour" hint="auto: the line's colour">
            <ColorField value={s.hatchColor ?? ''} auto={s.color} onChange={(hatchColor) => set({ hatchColor })} />
          </Row>
          <HatchRows h={s.hatch} look={s.hatchLook} onChange={(hatchLook) => set({ hatchLook })} />
        </>
      )}
    </>
  );

  // ---- position ----
  const place = (
    <>
      <CoordsRow coords={s.coords} where={where} onChange={(coords) => set({ coords })} />
      {(k === 'line' || k === 'arrow') && (
        <>
          {pair('Start', 'x1', 'y1', 'The start')}
          {pair('End', 'x2', 'y2', 'The end (the arrow head)')}
        </>
      )}
      {k === 'dimension' && (
        <>
          {pair('From', 'x1', 'y1', 'One end of the length measured')}
          {pair('To', 'x2', 'y2', 'The other end')}
        </>
      )}
      {(k === 'rect' || k === 'ellipse' || k === 'star' || k === 'regular' || k === 'arc' || k === 'image') && (
        <>
          {pair('Corner', 'x1', 'y1', 'One corner of its box')}
          {pair('Opposite', 'x2', 'y2', 'The opposite corner')}
        </>
      )}
      {k === 'callout' && (
        <>
          {pair('Box at', 'x1', 'y1', 'The middle of the box with the text')}
          {pair('Points to', 'x2', 'y2', 'The point the line goes to')}
        </>
      )}
      {k === 'scalebar' && pair('Start', 'x1', 'y1', 'Where the bar starts')}
      {k === 'xband' && pair('x range', 'x1', 'x2', 'From – to', ['from', 'to'])}
      {k === 'yband' && pair('y range', 'y1', 'y2', 'From – to', ['from', 'to'])}
      {k === 'vline' && at('x1')}
      {k === 'hline' && at('y1')}
      {k === 'bracket' && (o === 'down' || o === 'up') && (
        <>
          {pair('x range', 'x1', 'x2', 'From – to', ['from', 'to'])}
          {at('y1')}
        </>
      )}
      {k === 'bracket' && (o === 'left' || o === 'right') && (
        <>
          {pair('y range', 'y1', 'y2', 'From – to', ['from', 'to'])}
          {at('x1')}
        </>
      )}
      {k === 'bracket' && o === 'free' && (
        <>
          {pair('From', 'x1', 'y1')}
          {pair('To', 'x2', 'y2')}
        </>
      )}
      {turns && (
        <Row label="Rotation" hint="Clockwise (also: drag the round handle above it; Shift: by 15°)">
          <AngleField value={s.rotation} onChange={(v) => set({ rotation: Number.isFinite(v) ? v : 0 })} />
        </Row>
      )}
      {!drawing && <LayerRow z={s.z} onChange={(z) => set({ z })} />}
    </>
  );

  // ---- effects, more ----
  const effects = !band && (
    <>
      <Row label="Shadow" hint="A shadow under it (a closed shape: a copy of its shape; with a softness, or a line: a soft one)">
        <Toggle value={!!s.shadow} onChange={(shadow) => set({ shadow: shadow || undefined })} />
      </Row>
      {s.shadow && <ShadowRows v={s} def={{ x: 1.5, y: 1.5, blur: 0, opacity: 0.3 }} set={set} />}
      <Row label="Blur" hint="The whole shape blurred (0: sharp)">
        <SliderField value={s.blur ?? 0} onChange={(v) => set({ blur: v > 0 ? v : undefined })} min={0} max={5} step={0.1} unit="pt" />
      </Row>
    </>
  );
  const title = k === 'polygon' && open ? 'Polyline' : k === 'arc' ? { arc: 'Arc', pie: 'Pie', donut: 'Donut' }[arcKind(s)] : KIND_TITLE[k];
  return (
    <div className="props-panel props-embed nodrag" onKeyDown={ownKeys}>
      <Sections key={k} panel={`shape:${k}`} open={['own', 'text', 'line', 'fill']}>
        {hasOwn && (
          <Section value="own" title={title}>
            {own}
          </Section>
        )}
        {textB && (
          <Section value="text" title={k === 'line' || k === 'arrow' ? 'Text on it' : 'Text'} aside={(k === 'line' || k === 'arrow') && !s.text && !s.text2 ? 'none' : undefined}>
            {textB}
          </Section>
        )}
        {line && (
          <Section value="line" title="Line" aside={`${+s.width.toFixed(2)} pt`}>
            {line}
          </Section>
        )}
        {fill && (
          <Section value="fill" title="Fill" aside={s.fill ? `${Math.round(s.fillOpacity * 100)} %` : band ? undefined : 'none'}>
            {fill}
          </Section>
        )}
        <Section value="place" title="Position" aside={where === 'frame' ? (s.coords === 'data' ? 'data units' : '% of frame') : undefined}>
          {place}
        </Section>
        {effects && (
          <Section value="effects" title="Effects" aside={[s.shadow && 'shadow', s.blur && 'blur'].filter(Boolean).join(', ') || 'none'}>
            {effects}
          </Section>
        )}
      </Sections>
    </div>
  );
}

const ALIGNS: ['auto' | NonNullable<TextSpec['align']>, ReactNode, string][] = [
  ['auto', 'Auto', 'As its anchor'],
  ['left', 'Left', 'Left'],
  ['center', 'Centre', 'Centred'],
  ['right', 'Right', 'Right'],
  ['justify', 'Justify', 'Justified: every line but the last as wide as the longest'],
];

export function TextEditor({ s, set, where, extra }: { s: TextSpec; set: (p: Partial<TextSpec>) => void; where: Where; extra?: ReactNode }) {
  const unit = unitOf(s.coords, where);
  const fill = s.box === 'fill' || s.box === 'both';
  const border = s.box === 'border' || s.box === 'both';
  return (
    <div className="props-panel props-embed nodrag" onKeyDown={ownKeys}>
      <Sections panel="text" open={['text', 'place']}>
        <Section value="text" title="Text">
          <div className="prop-text">
            <RichInput multiline value={s.text} placeholder="Text (Enter: a new line)" onChange={(text) => set({ text })} />
          </div>
          <TextStyleRows value={s.style} onChange={(style) => set({ style })} />
          <Row label="Lines" hint="How its lines line up in its box (several lines); auto: as its anchor">
            <Choice value={s.align ?? 'auto'} onChange={(v) => set({ align: v === 'auto' ? undefined : v })} options={ALIGNS} />
          </Row>
        </Section>
        <Section value="place" title="Position" aside={s.rotation ? `${s.rotation}°` : undefined}>
          <CoordsRow coords={s.coords} where={where} onChange={(coords) => set({ coords })} />
          <Row label="At">
            <NumPair a={s.x} b={s.y} onA={(x) => set({ x })} onB={(y) => set({ y })} unit={unit} />
          </Row>
          <Row label="Anchor" hint="Which point of the text is at that place">
            <AnchorField<Anchor> value={s.anchor} onChange={(anchor) => set({ anchor })} />
          </Row>
          <Row label="Rotation" hint="Clockwise (also: drag the round handle above it on the figure; Shift: by 15°)">
            <AngleField value={s.rotation} onChange={(v) => set({ rotation: Number.isFinite(v) ? v : 0 })} />
          </Row>
          {extra && <div className="legacy-fields">{extra}</div>}
          {where !== 'drawing' && <LayerRow z={s.z} onChange={(z) => set({ z })} />}
        </Section>
        <Section value="box" title="Box" aside={s.box === 'none' ? 'none' : s.box === 'both' ? 'filled, border' : s.box === 'fill' ? 'filled' : 'border'}>
          <Row label="Box">
            <Choice
              value={s.box}
              onChange={(box) => set({ box })}
              options={[
                ['none', <BoxIcon key="none" box="none" />, 'none'],
                ['fill', <BoxIcon key="fill" box="fill" />, 'filled'],
                ['border', <BoxIcon key="border" box="border" />, 'border'],
                ['both', <BoxIcon key="both" box="both" />, 'filled, with a border'],
              ]}
            />
          </Row>
          {fill && (
            <>
              <Row label="Fill">
                <ColorField value={s.boxColor} onChange={(boxColor) => set({ boxColor: boxColor || '#ffffff' })} />
              </Row>
              <Row label="Fill opacity">
                <OpacityField value={s.boxOpacity ?? 1} onChange={(v) => set({ boxOpacity: Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1)) })} />
              </Row>
            </>
          )}
          {border && (
            <>
              <Row label="Border">
                <ColorField value={s.borderColor} onChange={(borderColor) => set({ borderColor: borderColor || '#000000' })} />
              </Row>
              <Row label="Width">
                <WidthField value={s.borderWidth} onChange={(v) => set({ borderWidth: Math.max(0, Number.isFinite(v) ? v : 0) })} max={4} />
              </Row>
              <Row label="Style">
                <PictureGrid value={s.borderDash ?? 'solid'} onChange={(borderDash) => set({ borderDash })} options={DASH_PICS} cols={4} />
              </Row>
              <Row label="Opacity">
                <OpacityField value={s.borderOpacity ?? 1} onChange={(v) => set({ borderOpacity: Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) })} />
              </Row>
            </>
          )}
          {s.box !== 'none' && (
            <>
              <Row label="Corners" hint="Rounded corners, pt">
                <SliderField value={s.radius ?? 0} onChange={(v) => set({ radius: Math.max(0, v || 0) })} min={0} max={15} step={0.5} unit="pt" />
              </Row>
              <Row label="Padding" hint="The room around the text, pt">
                <SliderField value={s.padding} onChange={(v) => set({ padding: Math.max(0, v || 0) })} min={0} max={15} step={0.5} unit="pt" />
              </Row>
              <Row label="Shadow" hint="A shadow under its box">
                <Toggle value={!!s.shadow} onChange={(shadow) => set({ shadow })} />
              </Row>
            </>
          )}
        </Section>
        <Section value="effects" title="Effects" aside={[s.textShadow && 'shadow', s.blur && 'blur'].filter(Boolean).join(', ') || 'none'}>
          <Row label="Letters" hint="A soft shadow of its letters">
            <Toggle value={!!s.textShadow} onChange={(textShadow) => set({ textShadow: textShadow || undefined })} label="shadow" />
          </Row>
          {s.textShadow && <ShadowRows v={s} def={{ x: 1, y: 1, blur: 1, opacity: 0.4 }} set={set} />}
          <Row label="Blur" hint="The text (and its box) blurred (0: sharp)">
            <SliderField value={s.blur ?? 0} onChange={(v) => set({ blur: v > 0 ? v : undefined })} min={0} max={5} step={0.1} unit="pt" />
          </Row>
        </Section>
      </Sections>
    </div>
  );
}

export function ColorbarEditor({ s, set, where }: { s: ColorbarSpec; set: (p: Partial<ColorbarSpec>) => void; where: Where }) {
  const vert = s.orientation === 'vertical';
  const labels = s.labels ?? 'auto';
  return (
    <div className="props-panel props-embed nodrag" onKeyDown={ownKeys}>
      {where === 'page' && <div className="prop-note">In a Merge: the colour map of the first curve coloured by a map, of all its Plots.</div>}
      <Sections panel="colorbar" open={['own', 'values', 'text']}>
        <Section value="own" title="Colour bar">
          <Row label="Orientation">
            <Choice
              value={s.orientation}
              onChange={(orientation) => set({ orientation })}
              options={[
                ['vertical', 'Vertical'],
                ['horizontal', 'Horizontal'],
              ]}
            />
          </Row>
          <Row label="Length" hint="% of the frame's height (vertical) or width (horizontal)">
            <SliderField value={s.length} onChange={(v) => set({ length: Math.max(1, v || 50) })} min={1} max={100} step={1} unit="%" />
          </Row>
          <Row label="Thickness">
            <SliderField value={s.thickness} onChange={(v) => set({ thickness: Math.max(1, v || 6) })} min={1} max={30} step={0.5} unit="pt" />
          </Row>
          <Row label="Frame" hint="Its width (0: none)">
            <WidthField value={s.frameWidth} onChange={(v) => set({ frameWidth: Math.max(0, v || 0) })} max={3} />
          </Row>
        </Section>
        <Section value="values" title="Values and ticks" aside={`${vert ? (s.side === 'start' ? 'left' : 'right') : s.side === 'start' ? 'top' : 'bottom'}, ${labels}`}>
          <Row label="Side" hint="Where its ticks, values and title go">
            <Choice<'start' | 'end'>
              value={s.side ?? 'end'}
              onChange={(side) => set({ side: side === 'end' ? undefined : side })}
              options={
                vert
                  ? [
                      ['start', 'Left'],
                      ['end', 'Right'],
                    ]
                  : [
                      ['start', 'Top'],
                      ['end', 'Bottom'],
                    ]
              }
            />
          </Row>
          <Row label="Values" hint="The values written by the bar">
            <ListField<NonNullable<ColorbarSpec['labels']>>
              value={labels}
              onChange={(v) => set({ labels: v === 'auto' ? undefined : v })}
              options={[
                ['auto', 'Auto (about so many)'],
                ['every', 'Every … (a step)'],
                ['levels', 'The levels of the map'],
                ['minmax', 'Min and max'],
                ['custom', 'My own list'],
                ['none', 'None'],
              ]}
            />
          </Row>
          {labels === 'auto' && (
            <Row label="About" hint="About this many values">
              <SliderField value={s.ticks} onChange={(v) => set({ ticks: Math.max(2, Math.floor(v) || 5) })} min={2} max={12} step={1} />
            </Row>
          )}
          {labels === 'every' && (
            <Row label="Every" hint="A value every so much (a log map: every so many decades), from a value (empty: from a multiple of the step)">
              <div className="prop-pair">
                <NumField value={s.every ?? NaN} min={0} placeholder="step" onChange={(every) => set({ every: every > 0 ? every : undefined })} />
                <NumField value={s.everyFrom ?? NaN} prefix="from" placeholder="auto" onChange={(everyFrom) => set({ everyFrom: Number.isFinite(everyFrom) ? everyFrom : undefined })} />
              </div>
            </Row>
          )}
          {labels === 'levels' && <div className="prop-note">The levels of a map filled by levels (a contour). Without levels: as Auto.</div>}
          {labels === 'custom' && (
            <Row label="List" hint="The values, with commas: 0, 0.5, 1.2 (those outside the map left out)">
              <MTextInput value={s.custom ?? ''} placeholder="0, 0.5, 1" onChange={(e) => set({ custom: e.currentTarget.value })} />
            </Row>
          )}
          {labels !== 'none' && (
            <>
              <Row label="Format">
                <ListField<LabelFormat>
                  value={s.format ?? 'auto'}
                  onChange={(format) => set({ format: format === 'auto' ? undefined : format })}
                  options={[
                    ['auto', 'Automatic'],
                    ['decimal', 'Decimal'],
                    ['sci', 'Scientific'],
                    ['eng', 'Engineering'],
                    ['common', 'Common ×10ⁿ'],
                    ['percent', 'Percent'],
                    ['si', 'SI prefixes (k, M, µ, n)'],
                  ]}
                />
              </Row>
              <Row label="Decimals" hint="Empty: as many as the step needs">
                <NumField value={s.decimals ?? NaN} min={0} max={12} step={1} placeholder="auto" onChange={(d) => set({ decimals: Number.isFinite(d) && d >= 0 ? Math.min(12, Math.floor(d)) : undefined })} />
              </Row>
            </>
          )}
          <Row label="Ticks">
            <Choice<NonNullable<ColorbarSpec['tickDir']>>
              value={s.tickDir ?? 'out'}
              onChange={(d) => set({ tickDir: d === 'out' ? undefined : d })}
              options={[
                ['out', 'Out'],
                ['in', 'In'],
                ['both', 'Across', 'Across its edge'],
                ['none', 'None'],
              ]}
            />
          </Row>
          {(s.tickDir ?? 'out') !== 'none' && (
            <>
              <Row label="Length">
                <SliderField value={s.tickLen ?? 2} onChange={(v) => set({ tickLen: v === 2 ? undefined : Math.max(0, v) })} min={0} max={8} step={0.5} unit="pt" />
              </Row>
              <Row label="Minor" hint="Minor ticks between two values (0: none; a log map: 2 … 9 of every decade)">
                <SliderField value={s.minor ?? 0} onChange={(v) => set({ minor: v > 0 ? Math.floor(v) : undefined })} min={0} max={9} step={1} />
              </Row>
            </>
          )}
        </Section>
        <Section value="text" title="Title and text">
          <Row label="Title">
            <RichInput value={s.title} placeholder="auto (the split column) or none" onChange={(title) => set({ title })} />
          </Row>
          <TextStyleRows value={s.text} onChange={(text) => set({ text })} />
        </Section>
        <Section value="place" title="Position">
          <Row label="Top left" hint={where === 'page' ? '% of the page' : '% of the frame (beyond 100: outside it, e.g. 103 on the right)'}>
            <NumPair a={s.x} b={s.y} onA={(x) => set({ x })} onB={(y) => set({ y })} unit="%" />
          </Row>
          <LayerRow z={s.z} onChange={(z) => set({ z })} />
        </Section>
      </Sections>
    </div>
  );
}

// The buttons that add annotations, by family: what each adds (its kind and its first look), in % of the frame / page.
type AddButton = { label: string; title?: string; spec: Partial<ShapeSpec>; frameOnly?: boolean; placePoints?: boolean };
const LINES: AddButton[] = [
  { label: 'Line', spec: { kind: 'line', head2: 'none', x1: 30, y1: 30, x2: 60, y2: 30 } },
  { label: 'Arrow', spec: { kind: 'arrow', x1: 30, y1: 30, x2: 50, y2: 50 } },
  { label: 'Curved arrow', title: 'An arrow bent to one side (drag the handle in its middle to bend it more, less, or the other way)', spec: { kind: 'arrow', curve: 0.3, x1: 30, y1: 60, x2: 60, y2: 40 } },
  { label: 'Vertical line', spec: { kind: 'vline', x1: 50, dash: 'dash' } },
  { label: 'Horizontal line', spec: { kind: 'hline', y1: 50, dash: 'dash' } },
];
const SHAPES: AddButton[] = [
  { label: 'Rectangle', spec: { kind: 'rect', x1: 30, y1: 30, x2: 60, y2: 60 } },
  { label: 'Ellipse', spec: { kind: 'ellipse', x1: 35, y1: 35, x2: 55, y2: 55 } },
  { label: 'Polygon', title: 'A polygon or a polyline: its points placed with the mouse on the figure (or written)', spec: { kind: 'polygon', points: '', closed: true, fill: '#56B4E9', fillOpacity: 0.3, color: '#0072B2' }, placePoints: true },
  { label: 'Star', spec: { kind: 'star', x1: 42, y1: 38, x2: 54, y2: 54, n: 5, inner: 0.382, fill: '#E69F00', fillOpacity: 1, width: 0.5 } },
  { label: 'Regular polygon', spec: { kind: 'regular', x1: 42, y1: 38, x2: 56, y2: 56, n: 6, fill: '#56B4E9', fillOpacity: 0.6, width: 0.5 } },
  { label: 'Arc', title: 'An arc of an ellipse (an open line)', spec: { kind: 'arc', x1: 40, y1: 35, x2: 60, y2: 60, a1: 0, a2: 270 } },
  { label: 'Pie / donut', title: 'A pie slice, or a donut’s (Kind: Pie or Donut; the hole and rounded corners in its options)', spec: { kind: 'arc', x1: 40, y1: 35, x2: 60, y2: 60, a1: 0, a2: 90, sector: true, fill: '#009E73', fillOpacity: 0.5, width: 0.5 } },
];
const REGIONS: AddButton[] = [
  { label: 'Band in x', title: 'A band between two x (a range of the data, under the curves)', spec: { kind: 'xband', x1: 40, x2: 60, z: -1 } },
  { label: 'Band in y', title: 'A band between two y (under the curves)', spec: { kind: 'yband', y1: 40, y2: 60, z: -1 } },
];
const MARKS: AddButton[] = [
  { label: 'Bracket', title: 'A bracket over a range (e.g. a significance mark), in any direction', spec: { kind: 'bracket', orient: 'down', bstyle: 'square', x1: 35, x2: 65, y1: 20, y2: 60, headSize: 4, text: '*' } },
  { label: 'Brace', title: 'A curly brace over a range, in any direction', spec: { kind: 'bracket', orient: 'down', bstyle: 'curly', x1: 35, x2: 65, y1: 20, y2: 60, headSize: 6, text: '' } },
  { label: 'Scale bar', title: 'A bar of a length in the units of the data, with its label', spec: { kind: 'scalebar', x1: 10, y1: 88, width: 1, headSize: 3, text: '' }, frameOnly: true },
];

// The list: one line per annotation (open its settings, remove it), buttons to add more.
// node: the node the annotations are of (its figure takes the polygon points placed with the mouse)
// show: an annotation double-clicked on the figure (opened)
// page: the page of the figure they are on (its text: what “auto” is in their text settings)
export function AnnotationsEditor({ items, onChange, where, node, show, page }: { items: AnnotationItem[] | undefined; onChange: (list: AnnotationItem[]) => void; where: Where; node?: string; show?: { item: string; seq: number }; page?: Partial<PageData> }) {
  const placing = useShapePlacing();
  const quickOn = useQuickBar();
  const list = items ?? [];
  const [open, setOpen] = useState<string | null>(show?.item ?? null);
  const [seen, setSeen] = useState(show?.seq);
  if (show && show.seq !== seen) {
    setSeen(show.seq);
    setOpen(show.item);
  }
  const add = (it: AnnotationItem) => {
    onChange([...list, it]);
    setOpen(it.id);
  };
  const setItem = (id: string, patch: object) => onChange(list.map((it) => (it.id === id ? ({ ...it, spec: { ...it.spec, ...patch } } as AnnotationItem) : it)));
  // new ones near the middle of the frame / page, in % (moved by dragging them)
  const pct = { coords: 'percent' as const };
  const group = (label: string, buttons: AddButton[]) => (
    <div className="row wrap">
      <span className="muted">{label}</span>
      {buttons
        .filter((b) => !b.frameOnly || where === 'frame')
        .map((b) => (
          <button
            key={b.label}
            className="nodrag"
            title={b.title}
            onClick={() => {
              const it = newAnnotation('shape', { ...pct, ...b.spec });
              add(it);
              if (b.placePoints && node) setShapePlacing({ node, item: it.id });
            }}
          >
            + {b.label}
          </button>
        ))}
    </div>
  );
  return (
    <PageTextContext.Provider value={page ? pageText(page) : null}>
      <div className="annotations">
        <div className="ann-quick" title="A bar over an annotation clicked on the figure: its colour, width, size … one click away (its × hides it)">
          <Toggle value={quickOn} onChange={setQuickBar} label="Quick bar on the figure" />
        </div>
        <div className="row wrap">
          <span className="muted">Text</span>
          <button className="nodrag" onClick={() => add(newAnnotation('text', { ...pct, x: 50, y: 50 }))}>
            + Text
          </button>
          <button className="nodrag" title="A text in a box with a line to a point" onClick={() => add(newAnnotation('shape', { ...pct, kind: 'callout', x1: 35, y1: 25, x2: 55, y2: 55, text: 'Note', fill: '#ffffff', fillOpacity: 1, width: 0.5, head2: 'triangle', headSize: 4, pad: 2, radius: 2 }))}>
            + Callout
          </button>
          <button className="nodrag" title="The scale of the colour map of a curve (Colour map in its style, or a split curve coloured by the map)" onClick={() => add(newAnnotation('colorbar', where === 'page' ? { ...COLORBAR_DEFAULTS } : {}))}>
            + Colour bar
          </button>
        </div>
        {group('Lines', LINES)}
        {group('Shapes', SHAPES)}
        {group('Regions', REGIONS)}
        {group('Marks', MARKS)}
        {!list.length && <div className="hint">No annotation. Each one added here is dragged on the figure (its handles: its points, bends, legs; the round one turns it); its settings open with ▸.</div>}
        {list.map((it) => (
          <div key={it.id} className="annotation-item">
            <div className="row">
              <button className={`nodrag ts-btn${open === it.id ? ' on' : ''}`} title="Its settings" onClick={() => setOpen(open === it.id ? null : it.id)}>
                {open === it.id ? <ChevronDown {...IC} /> : <ChevronRight {...IC} />}
              </button>
              <span className="grow ellipsis">{describe(it)}</span>
              <button className="nodrag ts-btn" title="A copy of it" onClick={() => add({ ...structuredClone(it), id: newAnnotation(it.type).id })}>
                <Copy {...IC} />
              </button>
              <button className="nodrag ts-btn" title="Remove it" onClick={() => onChange(list.filter((x) => x.id !== it.id))}>
                <X {...IC} />
              </button>
            </div>
            {open === it.id && (
              <div className="annotation-body">
                {it.type === 'shape' && (
                  <ShapeEditor
                    s={shapeSpec(it.spec)}
                    where={where}
                    set={(p) => setItem(it.id, p)}
                    {...(node ? { placing: placing?.node === node && placing.item === it.id, onPlace: () => setShapePlacing(placing?.node === node && placing.item === it.id ? null : { node, item: it.id }) } : {})}
                  />
                )}
                {it.type === 'text' && <TextEditor s={{ ...TEXT_SPEC_DEFAULTS, ...it.spec }} where={where} set={(p) => setItem(it.id, p)} />}
                {it.type === 'colorbar' && <ColorbarEditor s={{ ...COLORBAR_DEFAULTS, ...it.spec }} where={where} set={(p) => setItem(it.id, p)} />}
              </div>
            )}
          </div>
        ))}
      </div>
    </PageTextContext.Provider>
  );
}
