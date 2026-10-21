// The properties panels drawn for every kind of object, on a Plot, a Merge and in a Figure Drawing, in many states (all
// their sections open): none fails, React warns of nothing, each shows the settings it should. Bundled first (npm run
// check:ui), as it is TSX.
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { theme } from '../src/ui/theme.ts';
import { PageTextContext } from '../src/ui/pageText.ts';
import { ColorbarEditor, ShapeEditor, TextEditor, type Where } from '../src/nodes/AnnotationsEditor.tsx';
import { AxesEditor } from '../src/nodes/AxesEditor.tsx';
import { LegendEditor } from '../src/nodes/LegendEditor.tsx';
import { CurveStyleEditor } from '../src/nodes/CurveStyleEditor.tsx';
import { PageControls } from '../src/nodes/FigureView.tsx';
import { CURVE_STYLE_DEFAULTS, LEGEND_STYLE_DEFAULTS } from '../src/figure/spec.ts';
import { PLOT_PAGE_DEFAULTS } from '../src/defaults.ts';
import { AXIS_DEFAULTS, SIDE_DEFAULTS as AXIS_SIDE } from '../src/figure/spec.ts';
import { COLORBAR_DEFAULTS, SHAPE_DEFAULTS, TEXT_SPEC_DEFAULTS, TEXT_DEFAULTS, type ShapeKind, type ShapeSpec, type TextSpec } from '../src/figure/spec.ts';

// every section open
const SECTIONS = ['own', 'text', 'line', 'fill', 'place', 'effects', 'more', 'box'];
const store = new Map<string, string>();
const KINDS: ShapeKind[] = ['line', 'arrow', 'rect', 'ellipse', 'polygon', 'xband', 'yband', 'vline', 'hline', 'bracket', 'star', 'regular', 'arc', 'callout', 'scalebar', 'dimension', 'path', 'image'];
store.set('graph-flow:prop-sections', JSON.stringify(Object.fromEntries([...KINDS.map((k) => `shape:${k}`), 'text', 'colorbar'].map((p) => [p, SECTIONS]).concat([['axis-side', ['scale', 'ticks', 'line', 'numbers', 'title']], ['axis-grid', ['x', 'y', 'frame']], ['legend', ['place', 'entries', 'text', 'frame']], ['curve-line', ['line', 'fill']]]))));
(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };

let failed = 0;
let passed = 0;
const ok = (cond: boolean, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const warnings: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => warnings.push(a.map(String).join(' '));

const draw = (el: React.ReactElement) => renderToStaticMarkup(<MantineProvider theme={theme}><PageTextContext.Provider value={TEXT_DEFAULTS}>{el}</PageTextContext.Provider></MantineProvider>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// the states of a shape tried: as added, and with its options on
const states = (k: ShapeKind): [string, Partial<ShapeSpec>][] => [
  ['plain', {}],
  ['shadow, blur, own dashes', { shadow: true, blur: 1, dashPattern: '6 2', join: 'miter', miter: 6, cap: 'round' }],
  ['gradient linear placed', { grad: 'linear', fill: '#ff0000', fill2: '#0000ff', gradX1: 10, gradY1: 10, gradX2: 90, gradY2: 90, gradSpread: 'reflect' }],
  ['gradient radial', { grad: 'radial', fill: '#ff0000', fill2Opacity: 0.5, gradCx: 40 }],
  ['hatching', { hatch: 'x', hatchColor: '#123456', hatchLook: { spacing: 4 }, fill: '#eeeeee' }],
  ['hatching of rings', { hatch: 'o', hatchLook: { stagger: true, size: 2 }, fill: '#eeeeee' }],
  ['texts', { text: 'A', text2: 'B', textStyle: { size: 9, bold: true, font: 'Georgia, serif' }, labelAt: 0.3, textDir: 'level' }],
  ...(k === 'line' || k === 'arrow'
    ? ([
        ['bends', { bends: '1 2; 3 4' }],
        ['elbow', { route: 'hvh', radius: 3 }],
        ...(['double', 'tapered', 'wavy', 'zigzag', 'equilibrium', 'eqRight', 'eqLeft', 'retro'] as const).map((body): [string, Partial<ShapeSpec>] => [`body ${body}`, { body, cross: true }]),
      ] as [string, Partial<ShapeSpec>][])
    : []),
  ...(k === 'bracket' ? (['down', 'up', 'left', 'right', 'free'] as const).flatMap((orient) => (['square', 'curly', 'bar'] as const).map((bstyle): [string, Partial<ShapeSpec>] => [`${orient} ${bstyle}`, { orient, bstyle, textDir: 'angle', textAngle: 30, flip: true }])) : []),
  ...(k === 'polygon' ? ([['open smooth', { closed: false, smooth: true, points: '1 1; 2 2; 3 1' }]] as [string, Partial<ShapeSpec>][]) : []),
  ...(k === 'arc' ? ([['sector', { sector: true, a1: -45, a2: 200 }]] as [string, Partial<ShapeSpec>][]) : []),
  ...(k === 'rect' ? ([['own corners', { radii: '1 2 3 4' }]] as [string, Partial<ShapeSpec>][]) : []),
  ...(k === 'dimension' ? ([['decimals', { dec: 6, unit: 'nm', offset: -12 }]] as [string, Partial<ShapeSpec>][]) : []),
  ...(k === 'scalebar' ? ([['set', { len: 100, vertical: true }]] as [string, Partial<ShapeSpec>][]) : []),
  ['under the data', { z: -3 }],
];

const WHERE: Where[] = ['frame', 'page', 'drawing'];
for (const k of KINDS) {
  for (const where of WHERE) {
    if (k === 'scalebar' && where !== 'frame') continue;
    let worst = '';
    for (const [name, p] of states(k)) {
      const s: ShapeSpec = { ...SHAPE_DEFAULTS, kind: k, ...(k === 'polygon' ? { points: '1 1; 2 2; 3 1', closed: true } : {}), ...p };
      try {
        const html = draw(<ShapeEditor s={s} set={() => {}} where={where} placing={false} onPlace={() => {}} />);
        const t = text(html);
        const band = k === 'xband' || k === 'yband';
        // as the panel: a closed shape or a band has a fill (its gradient, its hatching)
        const fillable = band || ['rect', 'ellipse', 'star', 'regular', 'callout', 'path'].includes(k) || (k === 'arc' && !!s.sector) || (k === 'polygon' && s.closed !== false);
        // what each kind must show
        const must = [
          'Position',
          ...(band ? ['Fill', 'Colour'] : ['Line', 'Width', 'Opacity', 'Effects', 'Shadow']),
          ...(where === 'frame' ? ['Units'] : []),
          ...(where !== 'drawing' ? ['Layer'] : []),
          ...(k === 'line' || k === 'arrow' ? ['Heads', 'Head size', 'Route', 'Body', 'Crossed out', 'Text on it', 'Above', 'Below'] : []),
          ...(k === 'bracket' ? ['Direction', 'Style', 'Text', 'Gap'] : []),
          ...(k === 'star' ? ['Points', 'Inner size', 'Rotation'] : []),
          ...(k === 'regular' ? ['Sides'] : []),
          ...(k === 'arc' ? ['From', 'To', 'Sector'] : []),
          ...(k === 'callout' ? ['Head', 'Padding', 'Corners', 'Text'] : []),
          ...(k === 'scalebar' ? ['Length', 'Vertical', 'End ticks', 'Label'] : []),
          ...(k === 'dimension' ? ['Offset', 'Decimals', 'Unit', 'Heads'] : []),
          ...(k === 'polygon' ? ['Points', 'Outline', 'Smooth'] : []),
          ...(k === 'path' ? ['Outline', 'Holes'] : []),
          ...(k === 'image' ? ['Stretched', 'Replace picture'] : []),
          ...(p.grad && fillable ? ['Gradient', 'To colour', 'Beyond ends'] : []),
          ...(p.grad === 'linear' && fillable ? ['Angle', 'Place', 'Back across the box'] : []),
          ...(p.grad === 'radial' && fillable ? ['Place', 'Back to the middle'] : []),
          ...(p.hatch && fillable ? ['Hatching', 'Its colour', 'Spacing', 'Background', ...(p.hatch === 'o' ? ['Mark size', 'Staggered'] : ['Line'])] : []),
          ...(p.shadow && !band ? ['Direction', 'Distance', 'Softness'] : []),
        ];
        const lost = must.filter((w) => !t.includes(w));
        if (lost.length) worst ||= `${name}: no ${lost.join(', ')}`;
      } catch (e) {
        worst ||= `${name}: ${(e as Error).message}`;
      }
    }
    ok(!worst, `panel of a ${k} on a ${where}${worst ? ` — ${worst}` : ''}`);
  }
}

// texts
const tstates: [string, Partial<TextSpec>][] = [
  ['plain', {}],
  ['box both, shadows, blur, aligned, turned', { box: 'both', boxOpacity: 0.5, borderDash: 'dash', borderOpacity: 0.7, radius: 2, shadow: true, textShadow: true, blur: 1, align: 'justify', rotation: 30, style: { size: 11, color: '#ff0000', italic: false } }],
  ['box fill', { box: 'fill' }],
  ['box border', { box: 'border' }],
];
for (const where of WHERE) {
  let worst = '';
  for (const [name, p] of tstates) {
    try {
      const t = text(draw(<TextEditor s={{ ...TEXT_SPEC_DEFAULTS, ...p }} set={() => {}} where={where} extra={where === 'drawing' ? <span>EXTRA</span> : undefined} />));
      const must = ['Text', 'Font', 'Size', 'Colour', 'Lines', 'Position', 'Anchor', 'Rotation', 'Box', 'Effects', 'Letters', 'Blur', ...(where === 'frame' ? ['Units'] : []), ...(where !== 'drawing' ? ['Layer'] : ['EXTRA']), ...(p.box === 'both' ? ['Fill opacity', 'Border', 'Width', 'Corners', 'Padding', 'Direction'] : [])];
      const lost = must.filter((w) => !t.includes(w));
      if (lost.length) worst ||= `${name}: no ${lost.join(', ')}`;
    } catch (e) {
      worst ||= `${name}: ${(e as Error).message}`;
    }
  }
  ok(!worst, `panel of a text on a ${where}${worst ? ` — ${worst}` : ''}`);
}

// a colour bar's panel (the list itself is not drawn here: its store of the polygon placing needs a browser)
{
  let err = '';
  try {
    for (const where of ['frame', 'page'] as Where[]) {
      const t = text(draw(<ColorbarEditor s={{ ...COLORBAR_DEFAULTS }} set={() => {}} where={where} />));
      for (const w of ['Colour bar', 'Orientation', 'Length', 'Thickness', 'Labels', 'Frame', 'Title', 'Top left', 'Layer']) if (!t.includes(w)) err ||= `${where}: no ${w}`;
    }
  } catch (e) {
    err = (e as Error).message;
  }
  ok(!err, `a colour bar's panel${err ? ` — ${err}` : ''}`);
}


// the axes: every side, its own top / right scale or a mirror or a function, an extra axis, the grid; the limits and
// the step left automatic shown as drawn
{
  let err = '';
  const limits = { bottom: { lo: 400, hi: 700, step: 50 }, left: { lo: 0, hi: 1.2, step: 0.2 }, top: { lo: 400, hi: 700, step: 50 }, right: { lo: 0, hi: 1.2, step: 0.2 }, y3: { lo: -5, hi: 5, step: 2.5 } };
  const cases: [string, object, string[]][] = [
    ['bottom', {}, ['Scale', 'Start', 'End', 'placeholder="400"', 'placeholder="700"', 'Auto range', 'Type', 'Reversed', 'Breaks', 'Numbers at', 'every 50 now', 'Minor ticks', 'Direction', 'Line', 'Offset', 'Cross at', 'Numbers', 'Format', 'Decimals', 'Title', 'Position', 'Copy this look to']],
    ['left', { y: { ...AXIS_DEFAULTS, ticksBy: 'increment', step: NaN, breaks: '2-3' } }, ['placeholder="1.2"', 'Every', 'placeholder="0.2"', 'Starting at', 'Break gap']],
    ['top', {}, ['This axis', 'Mirror', 'Ticks', 'Numbers']],
    ['top', { top: { mode: 'own', scale: { ...AXIS_DEFAULTS, scale: 'log' }, fn: '' } }, ['Own scale', 'Start', 'Base']],
    ['right', { right: { mode: 'function', scale: AXIS_DEFAULTS, fn: '1239.84/x' } }, ['Value = f(x)', 'Start', 'End']],
    ['y3', { extra: [{ id: 'y3', side: 'right', scale: AXIS_DEFAULTS, style: { ...AXIS_SIDE } }] }, ['Side', 'Curves on this axis', 'placeholder="-5"', 'placeholder="5"']],
    ['grid', { grid: { x: { major: true, minor: false, color: '#c8c8c8', width: 0.4, dash: 'solid', opacity: 1, minorColor: '#e4e4e4' }, y: { major: false, minor: false, color: '#c8c8c8', width: 0.4, dash: 'solid', opacity: 1, minorColor: '#e4e4e4' } } }, ['Vertical grid (x)', 'Lines at', 'Minor colour', 'Horizontal grid (y)', 'Frame', 'Cut curves', 'Aspect', 'Panel label']],
  ];
  for (const [axis, value, must] of cases) {
    try {
      const html = draw(<AxesEditor value={value} onChange={() => {}} dataKinds show={{ axis, seq: 1 }} limits={limits} />);
      const t = text(html) + html;
      const lost = must.filter((w) => !t.includes(w));
      if (lost.length) err ||= `${axis}: no ${lost.join(', ')}`;
    } catch (e) {
      err ||= `${axis}: ${(e as Error).message}`;
    }
  }
  ok(!err, `the axes panel: every side, own / mirror / function, an extra axis, the grid; auto limits shown${err ? ` — ${err}` : ''}`);
}


// the legend, a curve's style (its first tab), the page
{
  let err = '';
  const check = (name: string, el: React.ReactElement, must: string[]) => {
    try {
      const t = text(draw(el));
      const lost = must.filter((w) => !t.includes(w));
      if (lost.length) err ||= `${name}: no ${lost.join(', ')}`;
    } catch (e) {
      err ||= `${name}: ${(e as Error).message}`;
    }
  };
  const curve = { key: 'c1', label: 'Absorbance', series: { x: { name: 'x', values: [1] }, y: { name: 'y', values: [1] } }, style: { ...CURVE_STYLE_DEFAULTS } } as never;
  check('legend', <LegendEditor value={{ show: true, frame: 'round', background: '#ffffff', arrange: 'grid' }} curves={[curve]} onChange={() => {}} />, ['Show the legend', 'Place', 'Left', 'Top', 'Anchor', 'Arrange', 'Columns', 'Fill', 'Reverse order', 'Layer', 'Entries', 'Title', 'Frame', 'Width', 'Corners', 'Its opacity', 'Sample line', 'Padding', 'Line spacing']);
  void LEGEND_STYLE_DEFAULTS;
  check('curve style', <CurveStyleEditor st={{ ...CURVE_STYLE_DEFAULTS, mode: 'linesymbol', fill: 'zero', fillHatch: 'x', widthBy: 'y', arrowEnd: 'triangle', halo: 1 }} set={() => {}} hasYErr hasXErr axes={{ x: [['bottom', 'X1']], y: [['left', 'Y1']], pick: () => {} }} />, ['Style', 'Connect', 'Colour', 'Width', 'Dashes', 'Opacity', 'Ends', 'Joins', 'Halo', 'Heads', 'Head size', 'Drop lines', 'Width from', 'Thinnest', 'Widest', 'Line is', 'Gap at symbols', 'Masked points', 'Fill under', 'Hatching', 'Its colour', 'Spacing']);
  check('page', <PageControls page={{ ...PLOT_PAGE_DEFAULTS, border: 1, title: 'T', background: '#eeeeee' }} set={() => {}} />, ['Size', 'Width, height', 'Text font', 'Text size', 'Text style', 'Title', 'Decimal comma', 'Formula font', 'Background', 'Border', 'Corners', 'Inset']);
  ok(!err, `the legend, a curve's style and the page panels${err ? ` — ${err}` : ''}`);
}

console.error = origError;
const real = warnings.filter((w) => !/useLayoutEffect does nothing on the server/.test(w));
ok(!real.length, `no React warnings${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
