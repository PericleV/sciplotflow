// The rows of a fill's gradient (a shape's, a page's, a legend's box): its kind, its second colour and that colour's
// opacity, its angle (linear), where it is in the box it fills (% of it, dragged on the pad as the handles on a figure
// place it), what is beyond its ends.
import { Button } from '@mantine/core';
import { RotateCcw } from 'lucide-react';
import { AngleField, Choice, ColorField, OpacityField, Row } from './props.tsx';
import { GradientPad } from './GradientPad.tsx';
import { linearEnds, NO_GRAD_PLACE, radialPlace } from '../figure/gradient.ts';
import type { GradFill } from '../figure/spec.ts';

// g: the gradient's settings; from: the colour it starts from; of: what it fills, in the hints (“the shape”, “the page”)
export function GradientRows({ g, from, set, of = 'the shape' }: { g: GradFill; from: string; set: (p: GradFill) => void; of?: string }) {
  const on = !!g.grad && g.grad !== 'none';
  const [g1, g2] = linearEnds(g);
  const rp = radialPlace(g);
  const placed = [g.gradX1, g.gradY1, g.gradX2, g.gradY2, g.gradCx, g.gradCy, g.gradR, g.gradR2].some((v) => v != null);
  const angle = placed && g.grad === 'linear' ? Math.round((Math.atan2(g2[1] - g1[1], g2[0] - g1[0]) * 180) / Math.PI) : (g.gradAngle ?? 90);
  // a new angle: placed ends turned about their middle (their length kept), else the angle across the box
  const turn = (deg: number) => {
    if (!placed) return set({ gradAngle: deg });
    const [mx, my] = [(g1[0] + g2[0]) / 2, (g1[1] + g2[1]) / 2];
    const h = Math.hypot(g2[0] - g1[0], g2[1] - g1[1]) / 2;
    const [c, sn] = [Math.cos((deg * Math.PI) / 180) * h, Math.sin((deg * Math.PI) / 180) * h];
    const r = (v: number) => Math.round(v * 100) / 100;
    set({ gradAngle: deg, gradX1: r(mx - c), gradY1: r(my - sn), gradX2: r(mx + c), gradY2: r(my + sn) });
  };
  return (
    <>
      <Row label="Gradient" hint="The fill going to a second colour: across, from a start to an end (linear), or from a centre out (radial)">
        <Choice<NonNullable<GradFill['grad']>>
          value={g.grad ?? 'none'}
          onChange={(grad) => set({ grad: grad === 'none' ? undefined : grad })}
          options={[
            ['none', 'None'],
            ['linear', 'Linear'],
            ['radial', 'Radial'],
          ]}
        />
      </Row>
      {on && (
        <div className="prop-sub">
          <Row label="To colour" hint="The gradient's second colour">
            <ColorField value={g.fill2 ?? ''} auto="#ffffff" onChange={(c) => set({ fill2: c || undefined })} />
          </Row>
          <Row label="Its opacity" hint="The second colour's opacity (0: it fades out)">
            <OpacityField value={g.fill2Opacity ?? 1} onChange={(v) => set({ fill2Opacity: Number.isFinite(v) && v < 1 ? Math.max(0, v) : undefined })} />
          </Row>
          {g.grad === 'linear' && (
            <Row label="Angle" hint={`In the box of ${of}: 0° left to right, 90° top to bottom, 45° corner to corner`}>
              <AngleField value={angle} onChange={(v) => turn(Number.isFinite(v) ? v : 90)} />
            </Row>
          )}
          <Row label="Place" hint={g.grad === 'radial' ? `Drag its centre, and its radii across and down (Shift: a circle); the square is the box of ${of}` : `Drag its start and its end; the square is the box of ${of}`}>
            <GradientPad
              place={g.grad === 'radial' ? { kind: 'radial', cx: rp.cx, cy: rp.cy, rx: rp.rx, ry: rp.ry } : { kind: 'linear', x1: g1[0], y1: g1[1], x2: g2[0], y2: g2[1] }}
              onChange={(p) => (p.kind === 'linear' ? set({ gradX1: p.x1, gradY1: p.y1, gradX2: p.x2, gradY2: p.y2 }) : set({ gradCx: p.cx, gradCy: p.cy, gradR: p.rx, gradR2: p.ry }))}
              from={from}
              to={g.fill2 || '#ffffff'}
              toOpacity={g.fill2Opacity ?? 1}
              spread={g.gradSpread ?? 'pad'}
            />
          </Row>
          {placed && (
            <Row label="">
              <Button variant="default" leftSection={<RotateCcw size={13} />} onClick={() => set({ ...NO_GRAD_PLACE, ...(g.grad === 'linear' ? { gradAngle: angle } : {}) })}>
                {g.grad === 'radial' ? 'Back to the middle' : 'Back across the box'}
              </Button>
            </Row>
          )}
          <Row label="Beyond ends" hint="Past its end (or its ellipse): the end colour kept, the gradient mirrored back and forth, or repeated">
            <Choice<NonNullable<GradFill['gradSpread']>>
              value={g.gradSpread ?? 'pad'}
              onChange={(v) => set({ gradSpread: v === 'pad' ? undefined : v })}
              options={[
                ['pad', 'End colour'],
                ['reflect', 'Mirrored'],
                ['repeat', 'Repeated'],
              ]}
            />
          </Row>
        </div>
      )}
    </>
  );
}
