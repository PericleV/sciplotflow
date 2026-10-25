// The Axes tab of a polar / radar chart (the 2D axes of a Plot do not apply to a circle): r (its limits, step or about
// how many circles, reversed, a hole in the centre, its values' format, place and text, its title), θ (where 0° is, the
// direction, the sector, the spokes, their labels and text, minor spokes, ticks outside the rim, its title), the grid
// (every family of lines its look) and the disc (its fill, bands of colour).
import type { GridLook, LabelFormat, PolarAxes } from '../figure/spec.ts';
import type { PolarSpec } from '../engine/polar.ts';
import type { PolarData } from '../types.ts';
import { AutoNumber, Choice, ColorField, ListField, NumPair, OpacityField, PicturePick, Row, Section, Sections, SliderField, TextStyleRows, Toggle, WidthField } from '../ui/props.tsx';
import { DASH_PICS } from '../ui/dashPics.tsx';
import { RichInput } from './fields.tsx';
import { TextInput } from '@mantine/core';

const FORMATS: [LabelFormat, string][] = [
  ['auto', 'Auto'],
  ['decimal', 'Decimal'],
  ['sci', 'Scientific'],
  ['eng', 'Engineering'],
  ['si', 'SI prefixes'],
  ['percent', 'Percent'],
];
const LABELS: [PolarSpec['thetaLabels'], string][] = [
  ['deg', 'Degrees'],
  ['rad', 'Radians (π)'],
  ['compass', 'Compass (8)'],
  ['compass16', 'Compass (16)'],
  ['custom', 'Typed'],
  ['none', 'None'],
];

// a family of grid lines: shown, its colour, width, dashes, opacity
function GridRows({ label, value, def, grid, onChange }: { label: string; value: GridLook | undefined; def: number; grid: string; onChange: (v: GridLook | undefined) => void }) {
  const v = value ?? {};
  const set = (p: Partial<GridLook>) => {
    const next: Record<string, unknown> = { ...v, ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    onChange(Object.keys(next).length ? (next as GridLook) : undefined);
  };
  const shown = v.show !== false;
  return (
    <>
      <Row label={label}>
        <Toggle value={shown} onChange={(on) => set({ show: on ? undefined : false })} />
      </Row>
      {shown && (
        <div className="prop-sub">
          <Row label="Colour" hint="auto: the grid's">
            <ColorField value={v.color ?? ''} auto={grid} onChange={(color) => set({ color: color || undefined })} />
          </Row>
          <Row label="Width">
            <WidthField value={v.width ?? def} onChange={(w) => set({ width: Number.isFinite(w) && w > 0 ? w : undefined })} max={3} />
          </Row>
          <Row label="Dashes">
            <PicturePick label="Dashes" value={v.dash ?? 'solid'} onChange={(dash) => set({ dash: dash === 'solid' ? undefined : dash })} options={DASH_PICS} cols={4} />
          </Row>
          <Row label="Opacity">
            <OpacityField value={v.opacity ?? 1} onChange={(o) => set({ opacity: Number.isFinite(o) && o < 1 ? Math.max(0, o) : undefined })} />
          </Row>
        </div>
      )}
    </>
  );
}

export function PolarAxesEditor({ d, set }: { d: PolarData; set: (p: Partial<PolarData>) => void }) {
  const A = d.paxes ?? {};
  const radar = d.kind === 'radar';
  const setA = (p: Partial<PolarAxes>) => {
    const next: Record<string, unknown> = { ...A, ...p };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
    set({ paxes: Object.keys(next).length ? (next as PolarAxes) : undefined });
  };
  const grid = d.gridColor || '#b0b0b0';
  const txt = (v: Record<string, unknown>) => (Object.keys(v).length ? v : undefined);
  return (
    <div className="props-panel props-embed nodrag">
      <Sections panel="polar-axes" open={['r']}>
        <Section value="r" title="r (radial axis)" aside={`${Number.isFinite(d.rMin) ? d.rMin : 'auto'} – ${Number.isFinite(d.rMax) ? d.rMax : 'auto'}`}>
          <Row label="Limits" hint="At the centre and at the rim (empty: from the data)">
            <NumPair a={d.rMin} b={d.rMax} names={['from', 'to']} onA={(rMin) => set({ rMin })} onB={(rMax) => set({ rMax })} />
          </Row>
          <Row label="Step" hint="The step between the circles (empty: about as many as below)">
            <AutoNumber value={A.rStep ?? NaN} auto={undefined} onChange={(v) => setA({ rStep: Number.isFinite(v) && v > 0 ? v : undefined })} />
          </Row>
          <Row label="Circles" hint="About this many">
            <SliderField value={d.rTicks} onChange={(v) => set({ rTicks: Math.min(20, Math.max(1, Math.round(v) || 5)) })} min={1} max={20} step={1} />
          </Row>
          <Row label="Reversed" hint="The largest value at the centre (an elevation, a depth)">
            <Toggle value={!!A.rReverse} onChange={(on) => setA({ rReverse: on || undefined })} />
          </Row>
          <Row label="Hole" hint="An empty disc in the centre, a part of the radius (0: none)">
            <SliderField value={Math.round((A.hole ?? 0) * 100)} onChange={(v) => setA({ hole: v > 0 ? Math.min(80, v) / 100 : undefined })} min={0} max={80} step={5} unit="%" />
          </Row>
          <Row label="Values">
            <Toggle value={A.rLabels !== false} onChange={(on) => setA({ rLabels: on ? undefined : false })} />
          </Row>
          {A.rLabels !== false && (
            <div className="prop-sub">
              <Row label="Along the spoke at" hint="The angle of the spoke the values are written along">
                <SliderField value={d.rLabelAngle} onChange={(v) => set({ rLabelAngle: Number.isFinite(v) ? v : 22.5 })} min={0} max={360} step={2.5} unit="°" />
              </Row>
              <Row label="Format">
                <ListField<LabelFormat> value={A.rFormat ?? 'auto'} onChange={(f) => setA({ rFormat: f === 'auto' ? undefined : f })} options={FORMATS} />
              </Row>
              <Row label="Decimals" hint="Empty: as many as the step needs">
                <AutoNumber value={A.rDecimals ?? NaN} auto={undefined} onChange={(v) => setA({ rDecimals: Number.isFinite(v) && v >= 0 ? Math.min(12, Math.round(v)) : undefined })} />
              </Row>
              <TextStyleRows value={A.rText} onChange={(rText) => setA({ rText: txt(rText) })} />
            </div>
          )}
          <Row label="Title" hint="Written along the spoke of the values (e.g. Gain (dB))">
            <RichInput value={A.rTitle ?? ''} placeholder="none" onChange={(rTitle) => setA({ rTitle: rTitle || undefined })} />
          </Row>
          {A.rTitle && <TextStyleRows value={A.rTitleText} onChange={(v) => setA({ rTitleText: txt(v) })} />}
        </Section>
        <Section value="theta" title="θ (angles)" aside={radar ? 'the categories' : `every ${d.thetaStep}°`}>
          {!radar && (
            <>
              <Row label="0° at">
                <Choice<PolarSpec['zero']>
                  value={d.zero}
                  onChange={(zero) => (set({ zero }), setA({ zeroAngle: undefined }))}
                  options={[
                    ['E', 'Right'],
                    ['N', 'Top'],
                    ['W', 'Left'],
                    ['S', 'Bottom'],
                  ]}
                />
              </Row>
              <Row label="Or at" hint="Any angle, counterclockwise from the right (empty: as above)">
                <AutoNumber value={A.zeroAngle ?? NaN} auto={undefined} unit="°" onChange={(v) => setA({ zeroAngle: Number.isFinite(v) ? v : undefined })} />
              </Row>
              <Row label="Clockwise">
                <Toggle value={d.clockwise} onChange={(clockwise) => set({ clockwise })} />
              </Row>
              <Row label="Sector" hint="The angles shown, degrees (0 to 360: all; 0 to 180: a half circle)">
                <NumPair a={d.from} b={d.to} names={['from', 'to']} onA={(from) => set({ from: Number.isFinite(from) ? from : 0 })} onB={(to) => set({ to: Number.isFinite(to) ? to : 360 })} />
              </Row>
              <Row label="Spokes every">
                <SliderField value={d.thetaStep} onChange={(v) => set({ thetaStep: Math.max(1, v || 30) })} min={5} max={90} step={5} unit="°" />
              </Row>
              <Row label="Labels">
                <ListField<PolarSpec['thetaLabels']> value={d.thetaLabels} onChange={(thetaLabels) => set({ thetaLabels })} options={LABELS} />
              </Row>
              {d.thetaLabels === 'custom' && (
                <Row label="Typed" hint="Comma-separated, in the order of the spokes (an empty one: no label)">
                  <TextInput size="xs" value={A.thetaCustom ?? ''} placeholder="E, NE, N …" onChange={(e) => setA({ thetaCustom: e.currentTarget.value || undefined })} />
                </Row>
              )}
              <Row label="Minor spokes" hint="Between two spokes (and a minor circle halfway between two circles)">
                <SliderField value={A.minor ?? 0} onChange={(v) => setA({ minor: v > 0 ? Math.round(v) : undefined })} min={0} max={9} step={1} />
              </Row>
            </>
          )}
          <Row label="Ticks outside" hint="Short ticks outside the rim at every spoke (0: none)">
            <SliderField value={A.ticksOut ?? 0} onChange={(v) => setA({ ticksOut: v > 0 ? v : undefined })} min={0} max={8} step={0.5} unit="pt" />
          </Row>
          <Row label="Labels distance" hint="How much farther out the labels are">
            <SliderField value={A.thetaGap ?? 0} onChange={(v) => setA({ thetaGap: v ? v : undefined })} min={-4} max={20} step={0.5} unit="pt" />
          </Row>
          <TextStyleRows value={A.thetaText} onChange={(v) => setA({ thetaText: txt(v) })} />
          <Row label="Title" hint="Written under the chart">
            <RichInput value={A.thetaTitle ?? ''} placeholder="none" onChange={(thetaTitle) => setA({ thetaTitle: thetaTitle || undefined })} />
          </Row>
          {A.thetaTitle && <TextStyleRows value={A.thetaTitleText} onChange={(v) => setA({ thetaTitleText: txt(v) })} />}
        </Section>
        <Section value="grid" title="Grid" aside={d.gridShape === 'polygon' && radar ? 'polygons' : 'circles'}>
          <Row label="Colour" hint="Of every line of the grid (each family can have its own below)">
            <ColorField value={grid} onChange={(gridColor) => set({ gridColor: gridColor || '#b0b0b0' })} />
          </Row>
          <Row label="Shape" hint="Circles, or polygons through the spokes">
            <Choice<PolarSpec['gridShape']>
              value={d.gridShape}
              onChange={(gridShape) => set({ gridShape })}
              options={[
                ['circle', 'Circles'],
                ['polygon', 'Polygons'],
              ]}
            />
          </Row>
          <GridRows label="Circles" value={A.rings} def={0.5} grid={grid} onChange={(rings) => setA({ rings })} />
          <GridRows label="Spokes" value={A.spokesLook} def={0.5} grid={grid} onChange={(spokesLook) => setA({ spokesLook })} />
          <GridRows label="Rim" value={A.rim} def={0.8} grid={grid} onChange={(rim) => setA({ rim })} />
          {!radar && (A.minor ?? 0) > 0 && <GridRows label="Minor ones" value={A.minorLook} def={0.3} grid={grid} onChange={(minorLook) => setA({ minorLook })} />}
        </Section>
        <Section value="disc" title="Disc" aside={A.disc || A.bands ? 'filled' : 'none'}>
          <Row label="Fill" hint="The disc's colour (none: not filled)">
            <ColorField value={A.disc ?? ''} none onChange={(disc) => setA({ disc: disc || undefined })} />
          </Row>
          {A.disc && (
            <Row label="Its opacity">
              <OpacityField value={A.discOpacity ?? 1} onChange={(v) => setA({ discOpacity: Number.isFinite(v) && v < 1 ? Math.max(0, v) : undefined })} />
            </Row>
          )}
          <Row label="Bands" hint="Every other ring between two circles in a colour (none: no bands)">
            <ColorField value={A.bands ?? ''} none onChange={(bands) => setA({ bands: bands || undefined })} />
          </Row>
          {A.bands && (
            <Row label="Their opacity">
              <OpacityField value={A.bandOpacity ?? 0.12} onChange={(v) => setA({ bandOpacity: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined })} />
            </Row>
          )}
        </Section>
      </Sections>
    </div>
  );
}
