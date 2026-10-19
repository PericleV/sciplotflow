// The annotations of a Plot (on its frame: in the units of the data or % of the frame) or of a Merge (% of the page),
// as a list: texts and callouts, lines and arrows (straight or bent), shapes (rectangles, ellipses, polygons, stars,
// regular polygons, arcs and sectors), bands, brackets and braces (in any direction), scale bars, colour bars. What each
// one is comes from the button that added it (only its close variants can be chosen after). Each has its own layer;
// they are dragged on the figure, with handles for their points, bends, legs and turning.
import { useState, type ReactNode } from 'react';
import { shapeSpec } from '../engine/evaluate.ts';
import { COLORBAR_DEFAULTS, TEXT_SPEC_DEFAULTS, type ArrowBody, type ColorbarSpec, type Hatch, type ShapeKind, type ShapeSpec, type TextSpec } from '../figure/spec.ts';
import { newAnnotation } from '../defaults.ts';
import type { AnnotationItem } from '../types.ts';
import { ANCHORS, DASHES, HATCHES, HEADS } from './figureOptions.ts';
import { setShapePlacing, useShapePlacing } from './placeStore.ts';
import { OptColor, RichInput, TextStyleControls } from './fields.tsx';
import { HatchLookFields, HatchMore } from './HatchMore.tsx';
import { Fold } from './Fold.tsx';
import { ChevronDown, ChevronRight, Link, Unlink } from 'lucide-react';
import { LayerField } from './LegendEditor.tsx';
import { describe } from './annotationNames.ts';
import { Check, Field, NumInput, Select, TextInput } from './ui.tsx';
import { bendPoints, bendText, bentLine, type Pt } from '../figure/shapes.ts';
import { BorderControls } from './BorderControls.tsx';
import { Copy, Ellipsis, RotateCcw, X } from 'lucide-react';
import { linearEnds, NO_GRAD_PLACE, radialPlace } from '../figure/gradient.ts';
import { IC } from './iconProps.ts';

// where: on the frame of a Plot (data units or % of the frame), on the page of a Merge (% of the page), or an object of
// a Figure Drawing (mm, its layer the order of its objects)
export type Where = 'frame' | 'page' | 'drawing';
const unitOf = (coords: 'data' | 'percent', where: Where) => (where === 'drawing' ? 'mm' : coords === 'percent' || where === 'page' ? '%' : '');

function CoordsField({ coords, onChange, where }: { coords: 'data' | 'percent'; onChange: (c: 'data' | 'percent') => void; where: Where }) {
  if (where !== 'frame') return null;
  return (
    <Field label="Coordinates" title="In the units of the data (it stays on its point when the limits change), or in % of the frame">
      <Select
        value={coords}
        options={[
          ['data', 'data units'],
          ['percent', '% of the frame'],
        ]}
        onChange={onChange}
      />
    </Field>
  );
}

// the close variants a shape can turn into (the same points)
const VARIANTS: Partial<Record<ShapeKind, [ShapeKind, string][]>> = {
  line: [
    ['line', 'line'],
    ['arrow', 'arrow'],
  ],
  rect: [
    ['rect', 'rectangle'],
    ['ellipse', 'ellipse'],
  ],
  star: [
    ['star', 'star'],
    ['regular', 'regular polygon'],
  ],
  vline: [
    ['vline', 'vertical'],
    ['hline', 'horizontal'],
  ],
};
const variantsOf = (k: ShapeKind) => VARIANTS[k] ?? Object.values(VARIANTS).find((v) => v.some(([x]) => x === k));

export function ShapeEditor({ s, set, where, placing, onPlace }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void; where: Where; placing?: boolean; onPlace?: () => void }) {
  const num = (v: number, min = 0) => Math.max(min, Number.isFinite(v) ? v : min);
  const k = s.kind;
  const open = k === 'polygon' && s.closed === false;
  const closed = k === 'rect' || k === 'ellipse' || k === 'star' || k === 'regular' || (k === 'arc' && !!s.sector) || (k === 'polygon' && !open) || k === 'callout' || k === 'path';
  const band = k === 'xband' || k === 'yband';
  const turns = k === 'rect' || k === 'ellipse' || k === 'star' || k === 'regular' || k === 'arc' || k === 'polygon' || k === 'path' || k === 'image';
  const unit = unitOf(s.coords, where);
  const variants = variantsOf(k);
  const pair = (label: string, a: 'x1' | 'x2' | 'y1' | 'y2', b: 'x1' | 'x2' | 'y1' | 'y2', title?: string, sep = '') => (
    <Field label={`${label} ${unit}`} title={title}>
      <span className="row">
        <NumInput className="short" value={s[a]} onChange={(v) => set({ [a]: v })} />
        {sep}
        <NumInput className="short" value={s[b]} onChange={(v) => set({ [b]: v })} />
      </span>
    </Field>
  );
  const o = s.orient ?? 'down';
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
  const drawing = where === 'drawing';
  const [hatchOpen, setHatchOpen] = useState(false);
  const fColor = (
    <Field label={band ? 'Colour' : 'Line colour'}>
      <input className="nodrag color" type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} />
    </Field>
  );
  const fWidth = (
    <Field label="Width" title="pt">
      <NumInput className="tiny" min={0} step={0.25} value={s.width} onChange={(v) => set({ width: num(v) })} />
    </Field>
  );
  const fDash = (
    <Field label="Dash">
      <Select value={s.dash} options={DASHES} onChange={(dash) => set({ dash })} />
    </Field>
  );
  const fOwnDash = (
    <Field label="Own dashes" title="Dashes of your own, in pt: dash gap dash gap … (e.g. 6 2 1 2); empty: the dash chosen">
      <TextInput className="short-text" value={s.dashPattern ?? ''} placeholder="e.g. 6 2 1 2" onChange={(v) => set({ dashPattern: v.trim() ? v : undefined })} />
    </Field>
  );
  const fOpacity = (
    <Field label="Opacity">
      <NumInput className="tiny" min={0} max={1} step={0.05} value={s.opacity} onChange={(v) => set({ opacity: Math.min(1, num(v)) })} />
    </Field>
  );
  const fEnds = (
    <Field label="Ends, corners" title="The ends of the lines (flat, round, square) and how they meet (sharp, round, cut)">
      <span className="row">
        <Select<NonNullable<ShapeSpec['cap']>>
          value={s.cap ?? 'butt'}
          options={[
            ['butt', 'flat'],
            ['round', 'round'],
            ['square', 'square'],
          ]}
          onChange={(cap) => set({ cap })}
        />
        <Select<NonNullable<ShapeSpec['join']>>
          value={s.join ?? 'miter'}
          options={[
            ['miter', 'sharp'],
            ['round', 'round'],
            ['bevel', 'cut'],
          ]}
          onChange={(join) => set({ join })}
        />
      </span>
    </Field>
  );
  const fMiter = (s.join ?? 'miter') === 'miter' && (
    <Field label="Sharp corners up to" title="How far a sharp corner may reach, × the line's width (beyond: cut); 4 by default">
      <NumInput className="tiny" min={1} step={0.5} value={s.miter ?? 4} onChange={(v) => set({ miter: v >= 1 && v !== 4 ? v : undefined })} />
    </Field>
  );
  const fFill = (closed || band) && (
    <Field label="Fill, opacity" title={band ? 'Fill colour (none: the colour above) and opacity' : 'Fill colour and opacity'}>
      <span className="row">
        <OptColor value={s.fill} onChange={(fill) => set({ fill })} />
        <NumInput className="tiny" min={0} max={1} step={0.05} value={s.fillOpacity} onChange={(v) => set({ fillOpacity: Math.min(1, num(v)) })} />
      </span>
    </Field>
  );
  // a gradient: its kind, second colour and its opacity, its angle (linear); then where it is in the shape's box (% of
  // it, as its handles on the figure place it), what is beyond its ends
  const gradOn = !!s.grad && s.grad !== 'none';
  const [g1, g2] = linearEnds(s);
  const rp = radialPlace(s);
  const placed = [s.gradX1, s.gradY1, s.gradX2, s.gradY2, s.gradCx, s.gradCy, s.gradR, s.gradR2].some((v) => v != null);
  const gradAngle = placed && s.grad === 'linear' ? Math.round((Math.atan2(g2[1] - g1[1], g2[0] - g1[0]) * 180) / Math.PI) : (s.gradAngle ?? 90);
  // a new angle: placed ends turned about their middle (their length kept), else the angle across the box
  const turnGrad = (deg: number) => {
    if (!placed) return set({ gradAngle: deg });
    const [mx, my] = [(g1[0] + g2[0]) / 2, (g1[1] + g2[1]) / 2];
    const h = Math.hypot(g2[0] - g1[0], g2[1] - g1[1]) / 2;
    const [c, sn] = [Math.cos((deg * Math.PI) / 180) * h, Math.sin((deg * Math.PI) / 180) * h];
    const r = (v: number) => Math.round(v * 100) / 100;
    set({ gradAngle: deg, gradX1: r(mx - c), gradY1: r(my - sn), gradX2: r(mx + c), gradY2: r(my + sn) });
  };
  const pct = (v: number | undefined, d: number, onChange: (v: number) => void, title: string) => <NumInput className="tiny" step={5} value={v ?? d} title={title} onChange={(x) => Number.isFinite(x) && onChange(x)} />;
  const fGrad = (closed || band) && (
    <>
      <Field label="Gradient" title="The fill going to a second colour (its opacity next to it): across, from a start to an end (linear, its angle in degrees), or from a centre out (radial)">
        <span className="row wrap">
          <Select<NonNullable<ShapeSpec['grad']>>
            value={s.grad ?? 'none'}
            options={[
              ['none', 'none'],
              ['linear', 'linear'],
              ['radial', 'radial'],
            ]}
            onChange={(grad) => set({ grad: grad === 'none' ? undefined : grad })}
          />
          {gradOn && <input className="nodrag color" type="color" value={s.fill2 || '#ffffff'} title="The second colour" onChange={(e) => set({ fill2: e.target.value })} />}
          {gradOn && <NumInput className="tiny" min={0} max={1} step={0.1} value={s.fill2Opacity ?? 1} title="The second colour's opacity (0: it fades out)" onChange={(v) => set({ fill2Opacity: Number.isFinite(v) && v < 1 ? Math.max(0, v) : undefined })} />}
          {s.grad === 'linear' && <NumInput className="tiny" step={15} value={gradAngle} title="Its angle, degrees, in the shape’s box (0: left to right, 90: top to bottom, 45: corner to corner)" onChange={(v) => turnGrad(Number.isFinite(v) ? v : 90)} />}
        </span>
      </Field>
      {gradOn && (
        <Field
          label={s.grad === 'radial' ? 'Centre, radii' : 'Start, end'}
          title={
            s.grad === 'radial'
              ? 'Its centre (x, y in % of the shape’s box) and its radii, across and down (% of the box’s half width and half height: 100 reaches its sides) — also by its handles on the figure (Shift: a circle)'
              : 'Where it starts and ends (x, y in % of the shape’s box: 0 its left or top, 100 its right or bottom) — also by its handles on the figure (Shift: by steps of 15°)'
          }
        >
          <span className="row wrap">
            {s.grad === 'radial' ? (
              <>
                {pct(s.gradCx, rp.cx, (gradCx) => set({ gradCx }), 'Centre x (%)')}
                {pct(s.gradCy, rp.cy, (gradCy) => set({ gradCy }), 'Centre y (%)')}
                {pct(s.gradR, rp.rx, (v) => set({ gradR: Math.max(0.5, v), gradR2: rp.ry }), 'Radius across (% of the half width)')}
                {pct(s.gradR2, rp.ry, (v) => set({ gradR: rp.rx, gradR2: Math.max(0.5, v) }), 'Radius down (% of the half height)')}
              </>
            ) : (
              <>
                {pct(s.gradX1, g1[0], (gradX1) => set({ gradX1, gradY1: g1[1], gradX2: g2[0], gradY2: g2[1] }), 'Start x (%)')}
                {pct(s.gradY1, g1[1], (gradY1) => set({ gradX1: g1[0], gradY1, gradX2: g2[0], gradY2: g2[1] }), 'Start y (%)')}
                {pct(s.gradX2, g2[0], (gradX2) => set({ gradX1: g1[0], gradY1: g1[1], gradX2, gradY2: g2[1] }), 'End x (%)')}
                {pct(s.gradY2, g2[1], (gradY2) => set({ gradX1: g1[0], gradY1: g1[1], gradX2: g2[0], gradY2 }), 'End y (%)')}
              </>
            )}
            {placed && (
              <button className="nodrag ts-btn de-ico" title={s.grad === 'radial' ? 'Back to the middle, out to the sides' : 'Back across the whole box at its angle'} onClick={(e) => (e.preventDefault(), set({ ...NO_GRAD_PLACE, ...(s.grad === 'linear' ? { gradAngle } : {}) }))}>
                <RotateCcw {...IC} />
              </button>
            )}
          </span>
        </Field>
      )}
      {gradOn && (
        <Field label="Beyond its ends" title="Past its end (or its ellipse): the end colour kept, the gradient mirrored back and forth, or repeated">
          <Select<NonNullable<ShapeSpec['gradSpread']>>
            value={s.gradSpread ?? 'pad'}
            options={[
              ['pad', 'the end colour'],
              ['reflect', 'mirrored'],
              ['repeat', 'repeated'],
            ]}
            onChange={(v) => set({ gradSpread: v === 'pad' ? undefined : v })}
          />
        </Field>
      )}
    </>
  );
  const fHatch = (closed || band) && (
    <Field label="Hatching" title="A hatching over the fill: its kind and colour (⋯ more)">
      <span className="row wrap">
        <Select<Hatch> value={s.hatch ?? 'none'} options={HATCHES} onChange={(hatch) => set({ hatch })} />
        {s.hatch && s.hatch !== 'none' && <OptColor value={s.hatchColor ?? ''} none="the line's" onChange={(hatchColor) => set({ hatchColor })} />}
        {s.hatch && !drawing && <HatchMore h={s.hatch} look={s.hatchLook} onChange={(hatchLook) => set({ hatchLook })} />}
        {s.hatch && s.hatch !== 'none' && drawing && (
          <button className={`nodrag ts-btn${hatchOpen ? ' on' : ''}`} title="More of the hatching: spacing, line, size, angle, opacity, background" onClick={(e) => (e.preventDefault(), setHatchOpen(!hatchOpen))}>
            <Ellipsis {...IC} />
          </button>
        )}
      </span>
    </Field>
  );
  const fHatchMore = drawing && hatchOpen && s.hatch && s.hatch !== 'none' && (
    <div className="hatch-panel">
      <HatchLookFields h={s.hatch} look={s.hatchLook} onChange={(hatchLook) => set({ hatchLook })} />
    </div>
  );
  const fShadow = !band && <Check label="Shadow" title="A shadow under it (a closed shape: a copy of its shape; with a blur, or a line: a soft one)" value={!!s.shadow} onChange={(shadow) => set({ shadow: shadow || undefined })} />;
  const fBlur = !band && (
    <Field label="Blur" title="The whole shape blurred, pt (0: sharp)">
      <NumInput className="tiny" min={0} step={0.5} value={s.blur ?? 0} onChange={(v) => set({ blur: v > 0 ? v : undefined })} />
    </Field>
  );
  const headed = k === 'line' || k === 'arrow' || k === 'dimension' || k === 'path' || open;
  const fHeads = (
    <>
      {headed && (
        <>
          <Field label="Head at start" title={k === 'path' ? 'At its first node (an open path only)' : undefined}>
            <Select value={s.head1} options={HEADS} onChange={(head1) => set({ head1 })} />
          </Field>
          <Field label="Head at end">
            <Select value={s.head2} options={HEADS} onChange={(head2) => set({ head2 })} />
          </Field>
        </>
      )}
      {k === 'callout' && (
        <Field label="Head at the point">
          <Select value={s.head2} options={HEADS} onChange={(head2) => set({ head2 })} />
        </Field>
      )}
      {(headed || k === 'callout') && (
        <Field label="Head size" title="pt">
          <NumInput className="tiny" min={0} step={0.5} value={s.headSize} onChange={(v) => set({ headSize: num(v) })} />
        </Field>
      )}
    </>
  );
  const fTicks = k === 'scalebar' && (
    <Field label="End ticks" title="pt">
      <NumInput className="tiny" min={0} step={0.5} value={s.headSize} onChange={(v) => set({ headSize: num(v) })} />
    </Field>
  );
  const rounded = k === 'rect' || k === 'callout' || ((k === 'line' || k === 'arrow') && !!s.route && s.route !== 'line');
  const fRadius = rounded && (drawing && k === 'rect' ? <CornerRadii s={s} set={set} /> : (
    <Field label="Corner radius" title="pt">
      <NumInput className="tiny" min={0} step={0.5} value={s.radius} onChange={(v) => set({ radius: num(v) })} />
    </Field>
  ));
  const fPad = k === 'callout' && (
    <Field label="Padding" title="pt around the text">
      <NumInput className="tiny" min={0} step={0.5} value={s.pad ?? 2} onChange={(v) => set({ pad: num(v) })} />
    </Field>
  );
  const fRotation = turns && (
    <Field label="Rotation" title="Degrees, clockwise (also: drag the round handle above it; Shift: by 15°)">
      <NumInput className="tiny" step={5} value={s.rotation} onChange={(v) => set({ rotation: Number.isFinite(v) ? v : 0 })} />
    </Field>
  );
  const fShadowMore = s.shadow && !band && <ShadowFields v={s} def={{ x: 1.5, y: 1.5, blur: 0, opacity: 0.3 }} set={set} />;
  const hasText = k === 'bracket' || k === 'callout' || k === 'scalebar' || k === 'line' || k === 'arrow' || k === 'dimension';
  const geomA = (
    <>
      <div className="grid2">
        {variants && (
          <Field label="Variant">
            <Select value={k} options={variants} onChange={(kind) => set({ kind, ...(kind === 'line' ? { head2: 'none' } : kind === 'arrow' ? { head2: s.head2 === 'none' ? 'triangle' : s.head2 } : {}) })} />
          </Field>
        )}
        <CoordsField coords={s.coords} where={where} onChange={(coords) => set({ coords })} />
      </div>
      {(k === 'line' || k === 'arrow') && (
        <>
          {pair('From x, y', 'x1', 'y1', 'The start')}
          {pair('To x, y', 'x2', 'y2', 'The end (the arrow head)')}
          {(s.route ?? 'line') === 'line' && (
            <Field label="Bend" title="0: straight; + or −: the middle pushed to one side or the other (also: drag the handle in its middle). + Bend: a point the line goes through (several: a curve through them all), dragged on the figure">
              <span className="row">
                {bends.length ? <span className="muted">through {bends.length} point{bends.length > 1 ? 's' : ''}</span> : <NumInput className="tiny" step={0.05} value={s.curve ?? 0} onChange={(v) => set({ curve: Number.isFinite(v) && v !== 0 ? v : undefined })} />}
                <button className="nodrag" title="Another point the line goes through: in the middle of its longest piece (then drag it on the figure)" onClick={addBend}>
                  + Bend
                </button>
                {bends.length > 0 && (
                  <button className="nodrag" title="The last bend taken away" onClick={() => set({ bends: bends.length > 1 ? bendText(bends.slice(0, -1)) : undefined })}>
                    − Bend
                  </button>
                )}
              </span>
            </Field>
          )}
          {bends.length > 0 && (s.route ?? 'line') === 'line' && (
            <Field label="Bends x, y" title="The points the line goes through, in order: x y; x y … (in its units)">
              <TextInput value={s.bends ?? ''} placeholder="x y; x y" onChange={(v) => set({ bends: v.trim() ? v : undefined })} />
            </Field>
          )}
          <ArrowFields s={s} set={set} part={drawing ? 'shape' : 'all'} />
        </>
      )}
      {k === 'dimension' && (
        <>
          {pair('From x, y', 'x1', 'y1', 'One end of the length measured')}
          {pair('To x, y', 'x2', 'y2', 'The other end')}
          <div className="grid2">
            <Field label="Offset" title="pt from the points to the dimension line (−: the other side; also: drag the handle in its middle)">
              <NumInput className="tiny" step={1} value={s.offset ?? 8} onChange={(v) => set({ offset: Number.isFinite(v) ? v : 8 })} />
            </Field>
            <Field label="Decimals, unit" title="The length written with so many decimals and its unit (in a drawing the length is in mm)">
              <span className="row">
                <NumInput className="tiny" min={0} max={6} step={1} value={s.dec ?? 1} onChange={(v) => set({ dec: Math.max(0, Math.min(6, Math.round(v) || 0)) })} />
                <TextInput className="tiny-text" value={s.unit ?? ''} placeholder="unit" onChange={(unit) => set({ unit: unit || undefined })} />
              </span>
            </Field>
          </div>
          <Field label="Text" title="Empty: the length measured; else this text">
            <RichInput value={s.text} placeholder="the length" onChange={(text) => set({ text })} />
          </Field>
          <TextStyleControls label="Text" value={s.textStyle} onChange={(textStyle) => set({ textStyle })} />
          <Field label="Text direction" title="Along the line (kept readable) or level">
            <Select<'along' | 'level'>
              value={s.textDir === 'level' ? 'level' : 'along'}
              options={[
                ['along', 'along it'],
                ['level', 'level'],
              ]}
              onChange={(textDir) => set({ textDir })}
            />
          </Field>
        </>
      )}
      {(k === 'rect' || k === 'ellipse' || k === 'star' || k === 'regular' || k === 'arc') && (
        <>
          {pair('From x, y', 'x1', 'y1', 'One corner of its box')}
          {pair('To x, y', 'x2', 'y2', 'The opposite corner')}
        </>
      )}
      {k === 'path' && (
        <>
          <Field label="Path (SVG)" title="Its outline as SVG path text, in its units (M, L, H, V, C, S, Q, T, A, Z): edit it or paste one; on the figure: its nodes dragged (double-click one: removed; Alt + click: smooth / corner; double-click the path: a node there)">
            <TextInput value={s.d ?? ''} placeholder="M 0 0 L 10 0 …" onChange={(d) => set({ d })} />
          </Field>
          <Check label="Holes by even-odd" title="Where it crosses itself or one part is inside another: holes by the even-odd rule (else by the direction of each part)" value={!!s.evenodd} onChange={(evenodd) => set({ evenodd: evenodd || undefined })} />
        </>
      )}
      {k === 'image' && (
        <>
          {pair('From x, y', 'x1', 'y1', 'One corner of its box')}
          {pair('To x, y', 'x2', 'y2', 'The opposite corner')}
          <div className="row wrap">
            <Check label="Stretched" title="Filling its box (else its proportions kept, in the middle of the box)" value={!!s.stretch} onChange={(stretch) => set({ stretch: stretch || undefined })} />
            <button
              className="nodrag"
              title="Another picture in its place (PNG, JPEG, SVG …)"
              onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = 'image/*,.svg';
                inp.onchange = () => {
                  const f = inp.files?.[0];
                  if (!f) return;
                  const rd = new FileReader();
                  rd.onload = () => set({ href: String(rd.result) });
                  rd.readAsDataURL(f);
                };
                inp.click();
              }}
            >
              Replace picture…
            </button>
          </div>
        </>
      )}
      {k === 'callout' && (
        <>
          {pair('Box at x, y', 'x1', 'y1', 'The middle of the box with the text')}
          {pair('Points to x, y', 'x2', 'y2', 'The point the line goes to')}
        </>
      )}
      {k === 'scalebar' && pair('From x, y', 'x1', 'y1', 'Where the bar starts')}
      {k === 'xband' && pair('x from – to', 'x1', 'x2', undefined, '–')}
      {k === 'yband' && pair('y from – to', 'y1', 'y2', undefined, '–')}
      {k === 'vline' && (
        <Field label={`At x ${unit}`}>
          <NumInput className="short" value={s.x1} onChange={(x1) => set({ x1 })} />
        </Field>
      )}
      {k === 'hline' && (
        <Field label={`At y ${unit}`}>
          <NumInput className="short" value={s.y1} onChange={(y1) => set({ y1 })} />
        </Field>
      )}
      {k === 'bracket' && (
        <>
          <div className="grid2">
            <Field label="Direction" title="Over or under a range of x, beside a range of y, or free: from one point to another in any direction">
              <Select<NonNullable<ShapeSpec['orient']>>
                value={o}
                options={[
                  ['down', '⊓ over x, legs down'],
                  ['up', '⊔ under x, legs up'],
                  ['left', '] beside y, legs left'],
                  ['right', '[ beside y, legs right'],
                  ['free', '⟋ free, any direction'],
                ]}
                onChange={(orient) => set({ orient })}
              />
            </Field>
            <Field label="Style">
              <Select<NonNullable<ShapeSpec['bstyle']>>
                value={s.bstyle ?? 'square'}
                options={[
                  ['square', '⊓ square'],
                  ['curly', '⏞ curly brace'],
                  ['bar', '├┤ bar with ends'],
                ]}
                onChange={(bstyle) => set({ bstyle })}
              />
            </Field>
          </div>
          {(o === 'down' || o === 'up') && (
            <>
              {pair('x from – to', 'x1', 'x2', undefined, '–')}
              <Field label={`At y ${unit}`}>
                <NumInput className="short" value={s.y1} onChange={(y1) => set({ y1 })} />
              </Field>
            </>
          )}
          {(o === 'left' || o === 'right') && (
            <>
              {pair('y from – to', 'y1', 'y2', undefined, '–')}
              <Field label={`At x ${unit}`}>
                <NumInput className="short" value={s.x1} onChange={(x1) => set({ x1 })} />
              </Field>
            </>
          )}
          {o === 'free' && (
            <>
              {pair('From x, y', 'x1', 'y1')}
              {pair('To x, y', 'x2', 'y2')}
              <Check label="Legs on the other side" value={!!s.flip} onChange={(flip) => set({ flip: flip || undefined })} />
            </>
          )}
          <div className="grid2">
            {s.bstyle === 'curly' ? (
              <Field label="Depth" title="pt (also: drag the handle at its end)">
                <NumInput className="tiny" min={0} step={0.5} value={s.headSize} onChange={(v) => set({ headSize: num(v) })} />
              </Field>
            ) : (
              <Field label={s.bstyle === 'bar' ? 'Ends' : 'Legs'} title="pt, at the start and at the end (also: drag the handle at the first one)">
                <span className="row">
                  <NumInput className="tiny" min={0} step={0.5} value={s.headSize} onChange={(v) => set({ headSize: num(v) })} />
                  <NumInput className="tiny" min={0} step={0.5} value={s.leg2 ?? s.headSize} onChange={(v) => set({ leg2: num(v) })} />
                </span>
              </Field>
            )}
            <Field label="Text gap" title="pt between the bracket and its text">
              <NumInput className="tiny" min={0} step={0.5} value={s.textGap ?? 1.5} onChange={(v) => set({ textGap: num(v) })} />
            </Field>
          </div>
        </>
      )}
    </>
  );
  const textB = (
    <>
      {(k === 'bracket' || k === 'callout' || k === 'scalebar') && (
        <>
          <Field label={k === 'scalebar' ? 'Label' : 'Text'}>
            <RichInput multiline={k === 'callout'} value={s.text} placeholder={k === 'bracket' ? 'e.g. ***, p < 0.01' : k === 'scalebar' ? 'the length (e.g. 100 nm)' : 'Text (Enter: a new line)'} onChange={(text) => set({ text })} />
          </Field>
          <TextStyleControls label="Text" value={s.textStyle} onChange={(textStyle) => set({ textStyle })} />
        </>
      )}
      {k === 'bracket' && (
        <Field label="Text direction" title="Along the bracket (kept readable), level, or at an angle (degrees, clockwise)">
          <span className="row">
            <Select<NonNullable<ShapeSpec['textDir']>>
              value={s.textDir ?? 'along'}
              options={[
                ['along', 'along it'],
                ['level', 'level'],
                ['angle', 'at an angle'],
              ]}
              onChange={(textDir) => set({ textDir })}
            />
            {s.textDir === 'angle' && <NumInput className="tiny" step={15} value={s.textAngle ?? 0} onChange={(v) => set({ textAngle: Number.isFinite(v) ? v : 0 })} />}
          </span>
        </Field>
      )}
    </>
  );
  const geomB = (
    <>
      {k === 'scalebar' && (
        <div className="grid2">
          <Field label="Length" title="In the units of the data along x (vertical: along y); empty: a round length, about a fifth of the frame (also: drag its end)">
            <NumInput className="short" min={0} value={s.len ?? NaN} placeholder="auto" onChange={(v) => set({ len: v > 0 ? v : undefined })} />
          </Field>
          <Check label="Vertical" value={!!s.vertical} onChange={(vertical) => set({ vertical: vertical || undefined })} />
        </div>
      )}
      {(k === 'star' || k === 'regular') && (
        <div className="grid2">
          <Field label={k === 'star' ? 'Points' : 'Sides'}>
            <NumInput className="tiny" min={3} max={64} step={1} value={s.n ?? (k === 'star' ? 5 : 6)} onChange={(v) => set({ n: Math.max(3, Math.min(64, Math.round(v) || 5)) })} />
          </Field>
          {k === 'star' && (
            <Field label="Inner size" title="The inner corners, as a part of the size (0.38: the usual five-pointed star)">
              <NumInput className="tiny" min={0.05} max={1} step={0.05} value={s.inner ?? 0.382} onChange={(v) => set({ inner: Math.max(0.05, Math.min(1, v || 0.382)) })} />
            </Field>
          )}
        </div>
      )}
      {k === 'arc' && (
        <div className="grid2">
          <Field label="From – to" title="Degrees, 0 to the right, counter-clockwise">
            <span className="row">
              <NumInput className="tiny" step={15} value={s.a1 ?? 0} onChange={(v) => set({ a1: Number.isFinite(v) ? v : 0 })} />–
              <NumInput className="tiny" step={15} value={s.a2 ?? 90} onChange={(v) => set({ a2: Number.isFinite(v) ? v : 90 })} />
            </span>
          </Field>
          <Check label="Sector (closed to the centre)" value={!!s.sector} onChange={(sector) => set({ sector: sector || undefined })} />
        </div>
      )}
      {k === 'polygon' && (
        <>
          <Field label="Points" title="x y; x y; … (in the units chosen above), or placed with the mouse">
            <span className="row">
              <input className="nodrag" type="text" value={s.points} placeholder="x y; x y; x y" onChange={(e) => set({ points: e.target.value })} />
              {onPlace && (
                <button className={`nodrag${placing ? ' on' : ''}`} title="Click on the figure: a point each click, drag one to move it, double-click to remove it (again: stop)" onClick={onPlace}>
                  {placing ? '✓ Placing' : 'Place on the figure'}
                </button>
              )}
            </span>
          </Field>
          <Field label="Outline" title="Closed: a shape (filled); open: a line through the points (with heads at its ends)">
            <span className="row">
              <Select<'closed' | 'open'>
                value={open ? 'open' : 'closed'}
                options={[
                  ['closed', 'closed'],
                  ['open', 'open (a polyline)'],
                ]}
                onChange={(v) => set({ closed: v === 'closed' })}
              />
              <Check label="Smooth" title="A smooth curve through the points" value={!!s.smooth} onChange={(smooth) => set({ smooth })} />
            </span>
          </Field>
        </>
      )}
    </>
  );
  if (drawing)
    return (
      <>
        <Fold title="Object">
          {geomA}
          {geomB}
          <div className="grid2">
            {fRadius}
            {fPad}
            {fRotation}
          </div>
        </Fold>
        {hasText && k !== 'dimension' && (
          <Fold title="Text">
            {textB}
            {(k === 'line' || k === 'arrow') && <ArrowFields s={s} set={set} part="labels" />}
          </Fold>
        )}
        {!band && (
          <Fold title="Stroke">
            <div className="grid2">
              {fColor}
              {fWidth}
              {fDash}
              {fOwnDash}
              {fOpacity}
              {fEnds}
              {fMiter}
            </div>
          </Fold>
        )}
        {(headed || k === 'callout' || k === 'scalebar') && (
          <Fold title={k === 'scalebar' ? 'Ends' : 'Arrow heads'}>
            <div className="grid2">
              {fHeads}
              {fTicks}
            </div>
          </Fold>
        )}
        {(closed || band) && (
          <Fold title="Fill">
            <div className="grid2">
              {band && fColor}
              {fFill}
              {fGrad}
              {fHatch}
            </div>
            {fHatchMore}
          </Fold>
        )}
        {!band && (
          <Fold title="Effects">
            <div className="grid2">
              {fShadow}
              {fBlur}
            </div>
            {fShadowMore}
          </Fold>
        )}
      </>
    );
  return (
    <>
      {geomA}
      {textB}
      {geomB}
      <div className="grid2">
        {fColor}
        {!band && (
          <>
            {fWidth}
            {fDash}
            {fOwnDash}
            {fOpacity}
            {fEnds}
            {fMiter}
          </>
        )}
        {fFill}
        {fGrad}
        {fHatch}
        {fShadow}
        {fBlur}
        {fHeads}
        {fTicks}
        {fRadius}
        {fPad}
        {fRotation}
      </div>
      {fShadowMore}
      <LayerField z={s.z} onChange={(z) => set({ z })} />
    </>
  );
}

const BODIES: [ArrowBody, string][] = [
  ['single', '— one line'],
  ['double', '═ two lines'],
  ['tapered', '◣ tapered'],
  ['wavy', '∿ wave'],
  ['zigzag', '⩘ zigzag'],
  ['equilibrium', '⇌ equilibrium'],
  ['eqRight', '⇌ equilibrium, to the right'],
  ['eqLeft', '⇌ equilibrium, to the left'],
  ['retro', '⇒ retrosynthetic'],
];
// A line's or arrow's route (as a line, or an elbow), its body (and what each needs), crossed out, its texts.
// part: the route and body, the texts, or both
function ArrowFields({ s, set, part = 'all' }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void; part?: 'all' | 'shape' | 'labels' }) {
  const body = s.body ?? 'single';
  const gapped = body === 'double' || body === 'retro' || body.startsWith('eq');
  return (
    <>
      {part !== 'labels' && <div className="grid2">
        <Field label="Route" title="A line (straight, bent, or through its bends), or an elbow: across then down, down then across, across–down–across, down–across–down (its middle piece dragged by its handle)">
          <Select<NonNullable<ShapeSpec['route']>>
            value={s.route ?? 'line'}
            options={[
              ['line', '╱ line / curve'],
              ['hv', '┐ across, down'],
              ['vh', '└ down, across'],
              ['hvh', '┐└ across, down, across'],
              ['vhv', '└┐ down, across, down'],
            ]}
            onChange={(route) => set({ route: route === 'line' ? undefined : route })}
          />
        </Field>
        <Field label="Body" title="One line, two, tapered, a wave or zigzag; chemistry: an equilibrium ⇌ (two harpoons; favouring a side: that one longer), a retrosynthetic arrow ⇒">
          <Select<ArrowBody> value={body} options={BODIES} onChange={(b) => set({ body: b === 'single' ? undefined : b })} />
        </Field>
        {gapped && (
          <Field label="Gap" title="pt between its two lines">
            <NumInput className="tiny" min={0.5} step={0.5} value={s.gap ?? Math.max(2, s.headSize * 0.5)} onChange={(v) => set({ gap: v > 0 ? v : undefined })} />
          </Field>
        )}
        {body === 'tapered' && (
          <Field label="Width at start" title="pt (its width at the end: Width)">
            <NumInput className="tiny" min={0} step={0.25} value={s.width2 ?? 0} onChange={(v) => set({ width2: Math.max(0, v || 0) })} />
          </Field>
        )}
        {(body === 'wavy' || body === 'zigzag') && (
          <Field label="Height, length" title="pt: how far the wave goes either side, and how long one wave is">
            <span className="row">
              <NumInput className="tiny" min={0.1} step={0.5} value={s.amp ?? 2} onChange={(v) => set({ amp: v > 0 ? v : undefined })} />
              <NumInput className="tiny" min={0.5} step={0.5} value={s.wave ?? 6} onChange={(v) => set({ wave: v > 0 ? v : undefined })} />
            </span>
          </Field>
        )}
        <Check label="Crossed out ✕" title="A cross in its middle: the reaction does not happen" value={!!s.cross} onChange={(cross) => set({ cross: cross || undefined })} />
      </div>}
      {part !== 'shape' && <>
      <Field label="Text above" title="Over the line (a line going up or down: at its right), e.g. the reagents">
        <RichInput value={s.text} placeholder="none" onChange={(text) => set({ text })} />
      </Field>
      <Field label="Text below" title="Under the line (going up or down: at its left), e.g. the conditions">
        <RichInput value={s.text2 ?? ''} placeholder="none" onChange={(text2) => set({ text2: text2 || undefined })} />
      </Field>
      {(!!s.text || !!s.text2) && (
        <>
          <TextStyleControls label="Text" value={s.textStyle} onChange={(textStyle) => set({ textStyle })} />
          <div className="grid2">
            <Field label="At" title="Where along the line, 0 – 1 (0.5: its middle)">
              <NumInput className="tiny" min={0} max={1} step={0.05} value={s.labelAt ?? 0.5} onChange={(v) => set({ labelAt: Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined })} />
            </Field>
            <Field label="Gap" title="pt between the line and its texts">
              <NumInput className="tiny" min={0} step={0.5} value={s.textGap ?? 1.5} onChange={(v) => set({ textGap: Math.max(0, v || 0) })} />
            </Field>
            <Field label="Direction" title="Along the line (kept readable) or level">
              <Select<'along' | 'level'>
                value={s.textDir === 'level' ? 'level' : 'along'}
                options={[
                  ['along', 'along it'],
                  ['level', 'level'],
                ]}
                onChange={(textDir) => set({ textDir })}
              />
            </Field>
          </div>
        </>
      )}
      </>}
    </>
  );
}

// A shadow's look, each field named: its direction (degrees, 0: to the right, 90: down), how far it is moved, how
// blurred, how strong (its opacity), its colour — kept as a move right and down (pt).
type ShadowLook = { shadowX?: number; shadowY?: number; shadowBlur?: number; shadowColor?: string; shadowOpacity?: number };
function ShadowFields({ v, def, set }: { v: ShadowLook; def: { x: number; y: number; blur: number; opacity: number }; set: (p: ShadowLook) => void }) {
  const [x, y] = [v.shadowX ?? def.x, v.shadowY ?? def.y];
  const dist = Math.hypot(x, y);
  const angle = dist ? (Math.atan2(y, x) * 180) / Math.PI : 45;
  const move = (a: number, d: number) => set({ shadowX: +(d * Math.cos((a * Math.PI) / 180)).toFixed(3), shadowY: +(d * Math.sin((a * Math.PI) / 180)).toFixed(3) });
  return (
    <div className="grid2">
      <Field label="Direction" title="Where the shadow falls, degrees: 0 to the right, 90 down, 180 to the left, 270 up">
        <NumInput className="tiny" step={15} value={+angle.toFixed(1)} onChange={(a) => Number.isFinite(a) && move(a, dist || 1)} />
      </Field>
      <Field label="Distance" title="How far the shadow is from it, pt">
        <NumInput className="tiny" min={0} step={0.5} value={+dist.toFixed(2)} onChange={(d) => Number.isFinite(d) && move(angle, Math.max(0, d))} />
      </Field>
      <Field label="Blur" title="How soft the shadow is, pt (0: sharp)">
        <NumInput className="tiny" min={0} step={0.5} value={v.shadowBlur ?? def.blur} onChange={(b) => set({ shadowBlur: Number.isFinite(b) ? Math.max(0, b) : undefined })} />
      </Field>
      <Field label="Intensity %" title="How dark the shadow is (its opacity), %">
        <NumInput className="tiny" min={0} max={100} step={5} value={Math.round((v.shadowOpacity ?? def.opacity) * 100)} onChange={(o) => Number.isFinite(o) && set({ shadowOpacity: Math.max(0, Math.min(100, o)) / 100 })} />
      </Field>
      <Field label="Colour">
        <input className="nodrag color" type="color" value={v.shadowColor || '#000000'} onChange={(e) => set({ shadowColor: e.target.value })} />
      </Field>
    </div>
  );
}

// A rectangle's rounded corners: one radius for all, or (unlinked) one for each corner (pt).
function CornerRadii({ s, set }: { s: ShapeSpec; set: (p: Partial<ShapeSpec>) => void }) {
  const r = (s.radii ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const own = r.length === 4 && r.every(Number.isFinite);
  const names = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
  return (
    <Field label="Corner radius" title="pt: one radius for all the corners, or (unlinked) one for each — top-left, top-right, bottom-right, bottom-left">
      <span className="row wrap">
        {own ? (
          r.map((v, i) => (
            <NumInput
              key={i}
              className="tiny"
              min={0}
              step={0.5}
              value={v}
              title={names[i]}
              onChange={(x) => {
                const q = r.slice();
                q[i] = Math.max(0, Number.isFinite(x) ? x : 0);
                set({ radii: q.join(' ') });
              }}
            />
          ))
        ) : (
          <NumInput className="tiny" min={0} step={0.5} value={s.radius} onChange={(v) => set({ radius: Math.max(0, Number.isFinite(v) ? v : 0) })} />
        )}
        <button className="nodrag ts-btn de-ico" title={own ? 'One radius for all the corners' : 'A radius for each corner'} onClick={(e) => (e.preventDefault(), set(own ? { radii: undefined, radius: r[0] } : { radii: Array(4).fill(s.radius || 0).join(' ') }))}>
          {own ? <Unlink size={14} strokeWidth={1.75} /> : <Link size={14} strokeWidth={1.75} />}
        </button>
      </span>
    </Field>
  );
}

export function TextEditor({ s, set, where, extra }: { s: TextSpec; set: (p: Partial<TextSpec>) => void; where: Where; extra?: ReactNode }) {
  const unit = unitOf(s.coords, where);
  const text = (
    <>
      <RichInput multiline value={s.text} placeholder="Text (Enter: a new line)" onChange={(text) => set({ text })} />
      <TextStyleControls label="Text" value={s.style} onChange={(style) => set({ style })} />
    </>
  );
  const place = (
    <>
      <CoordsField coords={s.coords} where={where} onChange={(coords) => set({ coords })} />
      <Field label={`At x, y ${unit}`}>
        <span className="row">
          <NumInput className="short" value={s.x} onChange={(x) => set({ x })} />
          <NumInput className="short" value={s.y} onChange={(y) => set({ y })} />
        </span>
      </Field>
      <Field label="Anchor" title="Which point of the text is at (x, y)">
        <Select value={s.anchor} options={ANCHORS} onChange={(anchor) => set({ anchor })} />
      </Field>
      <Field label="Rotation" title="Degrees, clockwise (also: drag the round handle above it on the figure; Shift: by 15°)">
        <NumInput className="tiny" step={15} value={s.rotation} onChange={(v) => set({ rotation: Number.isFinite(v) ? v : 0 })} />
      </Field>
    </>
  );
  const box = (
    <>
      <Field label="Box">
        <Select
          value={s.box}
          options={[
            ['none', 'none'],
            ['fill', 'filled'],
            ['border', 'border'],
            ['both', 'filled + border'],
          ]}
          onChange={(box) => set({ box })}
        />
      </Field>
      {(s.box === 'fill' || s.box === 'both') && (
        <Field label="Fill" title="Colour, opacity">
          <span className="row">
            <input className="nodrag color" type="color" value={s.boxColor} onChange={(e) => set({ boxColor: e.target.value })} />
            <NumInput className="tiny" min={0} max={1} step={0.05} value={s.boxOpacity ?? 1} title="Opacity (0 – 1)" onChange={(v) => set({ boxOpacity: Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1)) })} />
          </span>
        </Field>
      )}
      {(s.box === 'border' || s.box === 'both') && (
        <Field label="Border" title="Colour, width (pt), line, rounded corners (pt), opacity">
          <BorderControls
            value={{ color: s.borderColor, width: s.borderWidth, dash: s.borderDash ?? 'solid', radius: s.radius ?? 0, opacity: s.borderOpacity ?? 1 }}
            onChange={(p) => set({ ...(p.color !== undefined ? { borderColor: p.color } : {}), ...(p.width !== undefined ? { borderWidth: p.width } : {}), ...(p.dash ? { borderDash: p.dash } : {}), ...(p.radius !== undefined ? { radius: p.radius } : {}), ...(p.opacity !== undefined ? { borderOpacity: p.opacity } : {}) })}
          />
        </Field>
      )}
      {s.box !== 'none' && (
        <Field label="Corners, padding" title="Rounded corners (pt) and the room around the text (pt)">
          <span className="row">
            <NumInput className="tiny" min={0} step={0.5} value={s.radius ?? 0} onChange={(v) => set({ radius: Math.max(0, v || 0) })} />
            <NumInput className="tiny" min={0} step={0.5} value={s.padding} onChange={(v) => set({ padding: Math.max(0, v || 0) })} />
            {where !== 'drawing' && <Check label="Shadow" value={!!s.shadow} onChange={(shadow) => set({ shadow })} />}
          </span>
        </Field>
      )}
    </>
  );
  const blur = (
    <Field label="Blur" title="The text (and its box) blurred, pt (0: sharp)">
      <NumInput className="tiny" min={0} step={0.5} value={s.blur ?? 0} onChange={(v) => set({ blur: v > 0 ? v : undefined })} />
    </Field>
  );
  const align = (
    <Field label="Lines" title="How its lines line up in its box: left, centred, right, justified (every line but the last as wide as the longest); auto: as its anchor">
      <Select<NonNullable<TextSpec['align']> | ''>
        value={s.align ?? ''}
        options={[
          ['', 'auto (as the anchor)'],
          ['left', 'left'],
          ['center', 'centred'],
          ['right', 'right'],
          ['justify', 'justified'],
        ]}
        onChange={(v) => set({ align: v || undefined })}
      />
    </Field>
  );
  if (where === 'drawing')
    return (
      <>
        <Fold title="Text">
          {text}
          {align}
        </Fold>
        <Fold title="Object">
          <div className="grid2">{place}</div>
          {extra}
        </Fold>
        <Fold title="Box">
          <div className="grid2">{box}</div>
        </Fold>
        <Fold title="Effects">
          <div className="grid2">
            <Check label="Shadow of the letters" title="A soft shadow of its letters" value={!!s.textShadow} onChange={(textShadow) => set({ textShadow: textShadow || undefined })} />
            {s.box !== 'none' && <Check label="Shadow of the box" title="A shadow under its box" value={!!s.shadow} onChange={(shadow) => set({ shadow })} />}
            {blur}
          </div>
          {s.textShadow && <ShadowFields v={s} def={{ x: 1, y: 1, blur: 1, opacity: 0.4 }} set={set} />}
        </Fold>
      </>
    );
  return (
    <>
      {text}
      <div className="grid2">
        {place}
        {box}
        {blur}
      </div>
      <LayerField z={s.z} onChange={(z) => set({ z })} />
    </>
  );
}

function ColorbarEditor({ s, set, where }: { s: ColorbarSpec; set: (p: Partial<ColorbarSpec>) => void; where: Where }) {
  return (
    <>
      {where === 'page' && <div className="hint">In a Merge: the colour map of the first curve coloured by a map, of all its Plots.</div>}
      <div className="grid2">
        <Field label="Orientation">
          <Select
            value={s.orientation}
            options={[
              ['vertical', 'vertical'],
              ['horizontal', 'horizontal'],
            ]}
            onChange={(orientation) => set({ orientation })}
          />
        </Field>
        <Field label="Top-left corner %" title={where === 'page' ? '% of the page' : '% of the frame (beyond 100: outside it, e.g. 103 on the right)'}>
          <span className="row">
            <NumInput className="short" value={s.x} onChange={(x) => set({ x })} />
            <NumInput className="short" value={s.y} onChange={(y) => set({ y })} />
          </span>
        </Field>
        <Field label="Length %" title="% of the frame's height (vertical) or width (horizontal)">
          <NumInput className="tiny" min={1} step={1} value={s.length} onChange={(v) => set({ length: Math.max(1, v || 50) })} />
        </Field>
        <Field label="Thickness" title="pt">
          <NumInput className="tiny" min={1} step={0.5} value={s.thickness} onChange={(v) => set({ thickness: Math.max(1, v || 6) })} />
        </Field>
        <Field label="Labels" title="About this many">
          <NumInput className="tiny" min={2} step={1} value={s.ticks} onChange={(v) => set({ ticks: Math.max(2, Math.floor(v) || 5) })} />
        </Field>
        <Field label="Frame" title="Width, pt (0 = none)">
          <NumInput className="tiny" min={0} step={0.25} value={s.frameWidth} onChange={(v) => set({ frameWidth: Math.max(0, v || 0) })} />
        </Field>
      </div>
      <Field label="Title">
        <RichInput value={s.title} placeholder="auto (the split column) or none" onChange={(title) => set({ title })} />
      </Field>
      <TextStyleControls label="Text" value={s.text} onChange={(text) => set({ text })} />
      <LayerField z={s.z} onChange={(z) => set({ z })} />
    </>
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
  { label: 'Arc / sector', spec: { kind: 'arc', x1: 40, y1: 35, x2: 60, y2: 60, a1: 0, a2: 90, sector: true, fill: '#009E73', fillOpacity: 0.5, width: 0.5 } },
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
export function AnnotationsEditor({ items, onChange, where, node, show }: { items: AnnotationItem[] | undefined; onChange: (list: AnnotationItem[]) => void; where: Where; node?: string; show?: { item: string; seq: number } }) {
  const placing = useShapePlacing();
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
    <div className="annotations">
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
  );
}
