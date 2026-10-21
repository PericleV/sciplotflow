// The names of annotations (and of a Figure Drawing's objects) as their lists show them.
import { shapeSpec } from '../engine/evaluate.ts';
import { plainText } from '../figure/draw.ts';
import { TEXT_SPEC_DEFAULTS, type ShapeSpec } from '../figure/spec.ts';
import type { AnnotationItem } from '../types.ts';

// The name of a shape as shown in the list.
export function shapeName(s: ShapeSpec): string {
  switch (s.kind) {
    case 'line':
    case 'arrow': {
      const chem = { equilibrium: 'Equilibrium arrow', eqRight: 'Equilibrium arrow', eqLeft: 'Equilibrium arrow', retro: 'Retrosynthetic arrow' } as Record<string, string>;
      if (s.body && chem[s.body]) return chem[s.body];
      const arrow = s.kind === 'arrow' || s.head1 !== 'none' || s.head2 !== 'none';
      const both = s.head1 !== 'none' && s.head2 !== 'none';
      const base = s.route && s.route !== 'line' ? (arrow ? 'Elbow arrow' : 'Elbow line') : s.curve || s.bends ? (arrow ? 'Curved arrow' : 'Bent line') : arrow ? (both ? 'Double-headed arrow' : 'Arrow') : 'Line';
      return s.from || s.to ? `${base} (connector)` : base;
    }
    case 'dimension':
      return 'Dimension';
    case 'path':
      return 'Path';
    case 'image':
      return 'Image';
    case 'component':
      return 'Component';
    case 'rect':
      return 'Rectangle';
    case 'ellipse':
      return 'Ellipse';
    case 'polygon':
      return s.closed === false ? 'Polyline' : 'Polygon';
    case 'star':
      return 'Star';
    case 'regular':
      return 'Regular polygon';
    case 'arc':
      return !s.sector ? 'Arc' : (s.hole ?? 0) > 0 ? 'Donut' : 'Pie';
    case 'xband':
      return 'Band in x';
    case 'yband':
      return 'Band in y';
    case 'vline':
      return 'Vertical line';
    case 'hline':
      return 'Horizontal line';
    case 'bracket':
      return s.bstyle === 'curly' ? 'Brace' : 'Bracket';
    case 'callout':
      return 'Callout';
    case 'scalebar':
      return 'Scale bar';
  }
}
export const describe = (it: AnnotationItem): string => {
  if (it.type === 'text') return `Text “${plainText(it.spec.text ?? TEXT_SPEC_DEFAULTS.text).slice(0, 24)}”`;
  if (it.type === 'colorbar') return 'Colour bar';
  const s = shapeSpec(it.spec);
  const name = shapeName(s);
  return (s.kind === 'bracket' || s.kind === 'callout') && s.text ? `${name} “${plainText(s.text).slice(0, 18)}”` : name;
};
