// Draws a figure as SVG in points: the same drawing is shown in the nodes (scaled) and exported (SVG at its physical
// size, PNG / TIFF at a chosen dpi). Only SVG attributes, no CSS classes, so the export is the drawing.
import { createContext, Fragment, memo, useContext, type ReactNode } from 'react';
import { CommaContext, commaNumbers } from './comma.ts';
import { FocusCurve, HandleScale, Interactive, LayoutEdit, PickedNodes, type DragInfo } from './interactive.ts';
import type { AnnotationItem, CanvasItem } from '../types.ts';
import { categoryColors, legendColor, mapColor, mapT, stopsOf } from './colors.ts';
import { cellEdges } from '../engine/contour.ts';
import { legendLayout } from './legendLayout.ts';
import { dashArray, hasLine, hasSymbols, lineOnly, parseRich, plainText, richMetrics, runSize, splinePath, symbolPath } from './draw.ts';
import { CORNERED, isClosed as pathClosed, mapSegs, parsePath, pathBox, pathPolylines, pathText, radiiOf, roundedRectD, shapeToPath } from './paths.ts';
import { formatLabels, niceStep, parseBreaks } from './ticks.ts';
import { ThreeView } from './render3d.tsx';
import { aboveOf, arcPath, bendPoints, bendText, bentLine, bentPoints, bracketBase, bracketPath, bracketTextPlace, elbowCorners, endAngles, lineLength, niceLength, offsetLine, pointAlong, pointsD, pointsPath, roundedCorners, starPoints, taperOutline, throughLine, throughPoints, trimLine, waveLine, type Pt } from './shapes.ts';
import { compile } from '../engine/expr.ts';
import { gradAttrs, inBox, linearEnds, radialPlace } from './gradient.ts';
import { axesGeometry, axisNeeds, endLabels, labelReach, legendPlace, turnedExtent, validFor, type Box, type DrawnAxis, type Scale } from './axes.ts';
import {
  resolveText,
  toPt,
  SIDE_DEFAULTS,
  type Anchor,
  type Annotation,
  type ArrowHead,
  type AxesFig,
  type ColorbarSpec,
  type Curve,
  type Figure,
  type FigureBox,
  type LegendSpec,
  type Owner,
  type PanelScheme,
  type Placement,
  type ResolvedText,
  type ShapeSpec,
  type SideStyle,
  type TextDefaults,
  type TextSpec,
  axesStyle,
  type AxesStyle,
  type PageBorder,
  type Hatch,
  type HatchLook,
  BAR_LOOK_DEFAULTS,
  type BarLook,
  type BoxItem,
  type InsetItem,
  INSET_DEFAULTS,
  scaledSize,
  type WedgeItem,
} from './spec.ts';
import { maxOf, minOf } from '../engine/minmax.ts';

const n2 = (v: number) => (Number.isFinite(v) ? +v.toFixed(2) : 0);

// a curve other than the one the data reader is on: faded and grey
function Dim({ curve, children }: { curve: string; children: ReactNode }) {
  const focus = useContext(FocusCurve);
  if (!focus || focus === curve) return <>{children}</>;
  return (
    <g opacity={0.22} style={{ filter: 'grayscale(1)' }}>
      {children}
    </g>
  );
}

// ---- dragging on the figure (the Merge view): a draggable part carries what its drag changes in its node ----
// inside a drawing scaled to its place (a Merge, an inset): the mouse's moves (pt of the page) back in its own pt
const DragScale = createContext(1);
function Draggable({ info: info0, children }: { info: DragInfo; children: ReactNode }) {
  const on = useContext(Interactive);
  const k = useContext(DragScale);
  if (!on) return <>{children}</>;
  const info: DragInfo = k === 1 ? info0 : { ...info0, apply: (dx, dy, data, shift) => info0.apply(dx / k, dy / k, data, shift), transform: (dx, dy, shift) => (info0.transform ? info0.transform(dx / k, dy / k, shift) : `translate(${(dx / k).toFixed(2)} ${(dy / k).toFixed(2)})`) };
  return (
    <g
      data-drag={info.node}
      data-drag-move={info.root ? 'root' : undefined}
      ref={(el) => {
        if (el) (el as unknown as { __drag?: DragInfo }).__drag = info;
      }}
    >
      {children}
    </g>
  );
}
// What a drag changes: the node of the part itself, or — a legend or annotation kept in a Plot or a Merge — its entry
// there (the legend of the Plot, an item of the annotations).
function dragOf(key: string, owner: Owner | undefined, patch: (dx: number, dy: number, shift: boolean) => Record<string, unknown>): DragInfo {
  if (!owner) return { node: key, apply: (dx, dy, _data, shift) => patch(dx, dy, shift) };
  if (owner.field === 'legend') return { node: owner.node, apply: (dx, dy, data, shift) => ({ legend: { ...(data.legend as object), ...patch(dx, dy, shift) } }) };
  if (owner.field === 'ranges')
    return {
      node: owner.node,
      apply: (dx, dy, data, shift) => {
        const p = patch(dx, dy, shift) as { x1?: number; x2?: number };
        return {
          ranges: ((data.ranges as { lo: number; hi: number }[] | undefined) ?? []).map((q, j) => {
            if (j !== owner.item) return q;
            const [lo, hi] = [p.x1 ?? q.lo, p.x2 ?? q.hi];
            return lo <= hi ? { lo, hi } : { lo: hi, hi: lo };
          }),
        };
      },
    };
  if (owner.field === 'qfit')
    return {
      node: owner.node,
      apply: (dx, dy, data, shift) => {
        const p = patch(dx, dy, shift) as { x1?: number; x2?: number };
        // the curve's quick fits: the first curve's on the Plot itself, the others' in its rows
        type Fits = { quickFits?: { ranges?: { lo: number; hi: number }[] }[] };
        const moved = (fits: Fits['quickFits']) =>
          (fits ?? []).map((q, j) =>
            j !== owner.fit
              ? q
              : {
                  ...q,
                  ranges: (q.ranges ?? []).map((r, i) => {
                    if (i !== owner.item) return r;
                    const [lo, hi] = [p.x1 ?? r.lo, p.x2 ?? r.hi];
                    return lo <= hi ? { lo, hi } : { lo: hi, hi: lo };
                  }),
                },
          );
        if (owner.curve === 0) return { quickFits: moved((data as Fits).quickFits) };
        const rows = ((data.rows as Fits[] | undefined) ?? []).map((row, k) => (k === owner.curve - 1 ? { ...row, quickFits: moved(row.quickFits) } : row));
        return { rows };
      },
    };
  return {
    node: owner.node,
    apply: (dx, dy, data, shift) => ({ annotations: ((data.annotations as AnnotationItem[] | undefined) ?? []).map((it) => (it.id === owner.item ? { ...it, spec: { ...it.spec, ...patch(dx, dy, shift) } } : it)) }),
  };
}
const r1 = (v: number) => Math.round(v * 10) / 10;
const r5 = (v: number) => (Number.isFinite(v) ? +v.toPrecision(5) : v);

// ---- rich text ----
type VAlign = 'baseline' | 'top' | 'middle' | 'bottom';
// num: a number the figure writes (axes, values, labels) — with a decimal comma when the figure asks for it
// justify: the width (pt) every line but the last is spread to (more room between its words)
export function RichText({ x, y, text: raw, st, anchor = 'start', valign = 'baseline', rotate = 0, num = false, justify }: { x: number; y: number; text: string; st: ResolvedText; anchor?: 'start' | 'middle' | 'end'; valign?: VAlign; rotate?: number; num?: boolean; justify?: number }) {
  const comma = useContext(CommaContext);
  const text = num && comma ? commaNumbers(raw) : raw;
  const lines = parseRich(text);
  const widths = justify ? richMetrics(text, st).widths : [];
  const spacing = (li: number) => {
    if (!justify || li >= lines.length - 1) return undefined;
    const spaces = lines[li].reduce((a, r) => a + (r.t.match(/ /g)?.length ?? 0), 0);
    const extra = justify - widths[li];
    return spaces && extra > 0.01 ? n2(extra / spaces) : undefined;
  };
  const lh = st.size * 1.2;
  const n = lines.length;
  const first = valign === 'top' ? 0.8 * st.size : valign === 'middle' ? -((n - 1) / 2) * lh + 0.35 * st.size : valign === 'bottom' ? -(n - 1) * lh - 0.22 * st.size : 0;
  const tspans: ReactNode[] = [];
  let shift = 0; // baseline offset of the last run (pt)
  let pending = first; // vertical move before the next run
  lines.forEach((line, li) => {
    if (li > 0) pending += lh; // an empty line only moves the next one further down
    line.forEach((r, ri) => {
      const s = r.shift * st.size;
      const dy = pending + (s - shift);
      pending = 0;
      shift = s;
      tspans.push(
        <tspan
          key={`${li}-${ri}`}
          x={ri === 0 ? n2(x) : undefined}
          dy={dy ? n2(dy) : undefined}
          fontSize={n2(runSize(r, st.size))}
          fontWeight={r.bold || st.bold ? 'bold' : undefined}
          fontStyle={r.italic || st.italic ? 'italic' : undefined}
          fontFamily={r.font}
          fill={r.color}
          textDecoration={r.underline ? 'underline' : undefined}
          wordSpacing={spacing(li)}
        >
          {/* an overline (Miller indices: 11\overline{2}4) as a combining overline after every character — browsers do
              not draw text-decoration on a tspan */}
          {r.overline ? [...r.t].map((ch) => (ch.trim() ? `${ch}̅` : ch)).join('') : r.t}
        </tspan>,
      );
    });
  });
  return (
    <text x={n2(x)} y={n2(y)} fontFamily={st.font} fontSize={n2(st.size)} fill={st.color} textAnchor={anchor} transform={rotate ? `rotate(${n2(rotate)} ${n2(x)} ${n2(y)})` : undefined}>
      {tspans}
    </text>
  );
}

const ANCHOR_H: Record<Anchor, 'start' | 'middle' | 'end'> = { tl: 'start', cl: 'start', bl: 'start', tc: 'middle', c: 'middle', bc: 'middle', tr: 'end', cr: 'end', br: 'end' };
const ANCHOR_V: Record<Anchor, VAlign> = { tl: 'top', tc: 'top', tr: 'top', cl: 'middle', c: 'middle', cr: 'middle', bl: 'bottom', bc: 'bottom', br: 'bottom' };
// The top-left corner of a box of size w × h whose anchor point is at x, y.
const boxAt = (a: Anchor, x: number, y: number, w: number, h: number) => ({ x: x - (ANCHOR_H[a] === 'start' ? 0 : ANCHOR_H[a] === 'middle' ? w / 2 : w), y: y - (ANCHOR_V[a] === 'top' ? 0 : ANCHOR_V[a] === 'middle' ? h / 2 : h) });

// The colour of every point of a curve (null: one colour).
function pointColors(c: Curve): string[] | null {
  const st = c.style;
  if (st.colorBy === 'none' || !c.colorValues) return null;
  if (st.categorical) return categoryColors(c.colorValues, c.colorText);
  const [lo, hi] = c.colorRange ?? [0, 1];
  const stops = stopsOf(st.cmap, st.cmapColors);
  // 256 levels: as many as the eye tells apart, and few paths to draw
  const lut = Array.from({ length: 256 }, (_, k) => mapColor(stops, k / 255));
  return Array.from(c.colorValues, (v) => (Number.isFinite(v) ? lut[Math.round(mapT(v, lo, hi, st.cmapLog, st.cmapReverse) * 255)] : '#999999'));
}

// ---- curves ----
function Mark({ shape, size, x, y, color, edge, fill, width }: { shape: Curve['style']['symbol']; size: number; x: number; y: number; color: string; edge: string; fill: Curve['style']['symbolFill']; width: number }) {
  const open = lineOnly(shape) || fill === 'open' || fill === 'dot';
  return (
    <>
      <path d={symbolPath(shape, size)} transform={`translate(${n2(x)} ${n2(y)})`} fill={open ? 'none' : fill === 'white' ? '#ffffff' : color} stroke={edge} strokeWidth={lineOnly(shape) ? Math.max(width, 0.6) : width} strokeLinejoin="round" />
      {fill === 'dot' && <circle cx={n2(x)} cy={n2(y)} r={n2(Math.max(0.4, size * 0.12))} fill={edge} />}
    </>
  );
}

// A line of many points drawn as it looks: in every 0.25 pt along x, the first, lowest, highest and last point
// (only where x increases throughout; otherwise all the points).
function thinLine(px: number[], py: number[]): [number[], number[]] {
  for (let k = 1; k < px.length; k++) if (!(px[k] >= px[k - 1])) return [px, py];
  const ox: number[] = [];
  const oy: number[] = [];
  let k = 0;
  while (k < px.length) {
    const cell = Math.floor(px[k] * 4);
    const a = k;
    let [lo, hi] = [k, k];
    while (k < px.length && Math.floor(px[k] * 4) === cell) {
      if (py[k] < py[lo]) lo = k;
      if (py[k] > py[hi]) hi = k;
      k++;
    }
    for (const j of [...new Set([a, lo, hi, k - 1])].sort((u, v) => u - v)) {
      ox.push(px[j]);
      oy.push(py[j]);
    }
  }
  return [ox, oy];
}

function linePath(c: Curve, px: number[], py: number[]): string {
  if (!px.length) return '';
  if (c.style.mode === 'step') {
    let d = `M${n2(px[0])},${n2(py[0])}`;
    for (let k = 1; k < px.length; k++) {
      if (c.style.stepKind === 'vh') d += `V${n2(py[k])}H${n2(px[k])}`;
      else if (c.style.stepKind === 'mid') {
        const m = (px[k - 1] + px[k]) / 2;
        d += `H${n2(m)}V${n2(py[k])}H${n2(px[k])}`;
      } else d += `H${n2(px[k])}V${n2(py[k])}`;
    }
    return d;
  }
  if (c.style.connect === 'spline') return splinePath(px, py);
  const [qx, qy] = px.length > 4000 ? thinLine(px, py) : [px, py];
  return qx.map((x, k) => `${k ? 'L' : 'M'}${n2(x)},${n2(qy[k])}`).join('');
}

// The line a fill goes down (or up) to, in data units at every x: y = f(x), another curve of the Plot (straight lines
// between its points, held flat beyond its ends), straight lines through points; null: y = 0 or the frame.
function fillLine(c: Curve, others: Curve[]): ((x: number) => number) | null {
  const st = c.style;
  const through = (px: number[], py: number[]) => {
    const o = px.map((_, i) => i).filter((i) => Number.isFinite(px[i]) && Number.isFinite(py[i])).sort((a, b) => px[a] - px[b]);
    const X = o.map((i) => px[i]);
    const Y = o.map((i) => py[i]);
    if (!X.length) return null;
    return (x: number) => {
      if (x <= X[0]) return Y[0];
      if (x >= X[X.length - 1]) return Y[Y.length - 1];
      let [a, b] = [0, X.length - 1];
      while (b - a > 1) {
        const m = (a + b) >> 1;
        if (X[m] <= x) a = m;
        else b = m;
      }
      return Y[a] + ((Y[b] - Y[a]) * (x - X[a])) / (X[b] - X[a] || 1);
    };
  };
  if (st.fill === 'formula') {
    const f = compile(st.fillFormula || '0');
    if (typeof f === 'string') return null;
    const vars: Record<string, number> = {};
    return (x) => {
      vars.x = x;
      return f.fn(vars);
    };
  }
  if (st.fill === 'curve') {
    // the curve with that number in the same Plot (the keys of a Plot's curves end in :0, :1 …; a quick fit's go on
    // with :trend or :qf0:0)
    const key = c.key.replace(/:(?:trend|qf\d+:\d+)$/, '').replace(/:\d+$/, `:${Math.max(1, Math.floor(st.fillCurve) || 1) - 1}`);
    const o = others.find((q) => q.key === key);
    return o ? through(Array.from(o.series.x.values), Array.from(o.series.y.values)) : null;
  }
  if (st.fill === 'points') {
    const pts = st.fillPoints
      .split(';')
      .map((p) => p.split(',').map((v) => Number(v.trim())))
      .filter((p) => p.length === 2);
    return through(
      pts.map((p) => p[0]),
      pts.map((p) => p[1]),
    );
  }
  return null;
}

// A hatching as an SVG pattern: lines (/ \ | - + x), marks (dots, rings, squares, small x, a text) every `s` pt — in
// staggered rows if asked —, bricks, a zigzag, waves, a checkerboard; its look (spacing, width, size, angle, opacity,
// background) over the defaults s and width.
function HatchPattern({ id, h, s: s0, color, width: w0, look = {} }: { id: string; h: Hatch; s: number; color: string; width: number; look?: HatchLook }) {
  const s = Math.max(1, look.spacing ?? (h === 'text' ? 2 * s0 : s0));
  const width = Math.max(0.05, look.width ?? w0);
  const size = look.size !== undefined && look.size > 0 ? look.size : NaN;
  const marks = h === '.' || h === 'o' || h === 'squares' || h === 'xs' || h === 'text' || h === 'dots2';
  const stagger = marks && (h === 'dots2' || !!look.stagger);
  const tw = h === 'brick' || h === 'checker' ? 2 * s : s;
  const th = h === 'checker' || stagger ? 2 * s : s;
  const d =
    h === '/'
      ? `M0,${s}L${s},0M${-s / 2},${s / 2}L${s / 2},${-s / 2}M${s / 2},${1.5 * s}L${1.5 * s},${s / 2}`
      : h === '\\'
        ? `M0,0L${s},${s}M${-s / 2},${s / 2}L${s / 2},${1.5 * s}M${s / 2},${-s / 2}L${1.5 * s},${s / 2}`
        : h === '|'
          ? `M${s / 2},0V${s}`
          : h === '-'
            ? `M0,${s / 2}H${s}`
            : h === '+'
              ? `M${s / 2},0V${s}M0,${s / 2}H${s}`
              : h === 'x'
                ? `M0,0L${s},${s}M0,${s}L${s},0`
                : h === 'brick'
                  ? `M0,0H${2 * s}M0,${s / 2}H${2 * s}M0,0V${s / 2}M${s},${s / 2}V${s}`
                  : h === 'zigzag'
                    ? `M0,${0.75 * s}L${s / 2},${0.25 * s}L${s},${0.75 * s}`
                    : h === 'wave'
                      ? `M0,${s / 2}Q${s / 4},${s / 8} ${s / 2},${s / 2}T${s},${s / 2}`
                      : '';
  // a mark at (x, y)
  const mark = (x: number, y: number, k: number) => {
    if (h === '.' || h === 'dots2') return <circle key={k} cx={n2(x)} cy={n2(y)} r={n2(Number.isFinite(size) ? size / 2 : Math.max(0.3, width))} fill={color} />;
    if (h === 'o') return <circle key={k} cx={n2(x)} cy={n2(y)} r={n2(Number.isFinite(size) ? size / 2 : s / 4)} stroke={color} strokeWidth={width} fill="none" />;
    const a = (Number.isFinite(size) ? size : s / 2) / 2;
    if (h === 'squares') return <rect key={k} x={n2(x - a)} y={n2(y - a)} width={n2(2 * a)} height={n2(2 * a)} stroke={color} strokeWidth={width} fill="none" />;
    if (h === 'xs') return <path key={k} d={`M${n2(x - a)},${n2(y - a)}L${n2(x + a)},${n2(y + a)}M${n2(x - a)},${n2(y + a)}L${n2(x + a)},${n2(y - a)}`} stroke={color} strokeWidth={width} fill="none" />;
    return (
      <text key={k} x={n2(x)} y={n2(y)} fontSize={n2(Number.isFinite(size) ? size : s * 0.7)} textAnchor="middle" dominantBaseline="central" fill={color}>
        {[...(look.text?.trim() || '×')].slice(0, 5).join('')}
      </text>
    );
  };
  const at: [number, number][] = stagger
    ? [
        [s / 2, s / 2],
        [0, 1.5 * s],
        [s, 1.5 * s],
      ]
    : [[s / 2, s / 2]];
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={n2(tw)} height={n2(th)} patternTransform={look.angle ? `rotate(${n2(look.angle)})` : undefined}>
      {look.bg && <rect width={n2(tw)} height={n2(th)} fill={look.bg} />}
      <g opacity={look.opacity !== undefined && look.opacity < 1 ? look.opacity : undefined}>
        {d && <path d={d} stroke={color} strokeWidth={width} fill="none" />}
        {h === 'checker' && <path d={`M0,0H${s}V${s}H0ZM${s},${s}H${2 * s}V${2 * s}H${s}Z`} fill={color} />}
        {marks && at.map(([x, y], k) => mark(x, y, k))}
      </g>
    </pattern>
  );
}
const lighter = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return '#ffffff';
  const v = parseInt(m[1], 16);
  const mix = (x: number) => Math.round(x + (255 - x) * 0.65);
  return `rgb(${mix(v >> 16)}, ${mix((v >> 8) & 255)}, ${mix(v & 255)})`;
};

// The gradient of a filled thing: from its own second colour, or from the look's gradient; null: a plain colour.
const gradPair = (col: string, col2: string | undefined, lk: BarLook): [string, string] | null =>
  col2 ? [col, col2] : lk.gradient ? [lk.gradTop || col, lk.gradBase || lighter(lk.gradTop || col)] : null;
// the gradients used (from the end of the values to the base), an id each
function GradDefs({ keys, id, hor }: { keys: string[]; id: (k: number) => string; hor: boolean }) {
  return (
    <>
      {keys.map((k, i) => {
        const [a, b] = k.split('|');
        return (
          <linearGradient key={k} id={id(i)} x1={hor ? '1' : '0'} y1="0" x2="0" y2={hor ? '0' : '1'}>
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        );
      })}
    </>
  );
}

// Bars (a histogram, a bar chart): filled rectangles (vertical or horizontal) with their edge, hatching, gradient,
// rounded corners, shadow, a colour each, error bars and values written; or the outline of the steps, or the steps
// filled.
function BarsView({ c, sx, sy, gid, defaults }: { c: Curve; sx: Scale; sy: Scale; gid: string; defaults: TextDefaults }) {
  const st = c.style;
  const b = c.bars!;
  const lk = { ...BAR_LOOK_DEFAULTS, ...b.style };
  const hor = !!b.horizontal;
  const val = hor ? c.series.x.values : c.series.y.values;
  const n = val.length;
  const fillC = st.fillColor || st.color;
  const edge = st.edgeColor || st.color;
  const ok = (i: number) => Number.isFinite(val[i]) && Number.isFinite(b.lo[i]) && Number.isFinite(b.hi[i]) && Number.isFinite(b.base[i]);
  // the box of bar i (pt): across from lo to hi, along from base to the value
  const box = (i: number) => {
    const [a0, a1] = hor ? [sy.f(b.lo[i]), sy.f(b.hi[i])] : [sx.f(b.lo[i]), sx.f(b.hi[i])];
    const [v0, v1] = hor ? [sx.f(b.base[i]), sx.f(val[i])] : [sy.f(b.base[i]), sy.f(val[i])];
    return hor ? { x: Math.min(v0, v1), y: Math.min(a0, a1), w: Math.abs(v1 - v0), h: Math.abs(a1 - a0), v0, v1 } : { x: Math.min(a0, a1), y: Math.min(v0, v1), w: Math.abs(a1 - a0), h: Math.abs(v1 - v0), v0, v1 };
  };
  const colorOf = (i: number) => b.colors?.[i] || fillC;
  const hatchC = lk.hatchColor || edge;
  const pat = `${gid}-hatch`;
  // a bar's own look (coloured by category): its opacity, edge, hatching, error bars
  const L = (i: number) => b.looks?.[i] ?? null;
  const edgeOf = (i: number) => L(i)?.edgeColor || edge;
  const ewOf = (i: number) => L(i)?.edgeWidth ?? st.lineWidth;
  const hatchOf = (i: number) => L(i)?.hatch ?? lk.hatch;
  const ownPat = (i: number) => !!L(i) && (L(i)!.hatch !== undefined || !!L(i)!.hatchColor || !!L(i)!.edgeColor);
  const patOf = (i: number) => (ownPat(i) ? `${pat}-${i}` : pat);
  if (b.look === 'bars') {
    const pairs = Array.from({ length: n }, (_, i) => gradPair(colorOf(i), b.colors2?.[i], lk));
    const used = [...new Set(pairs.flatMap((p) => (p ? [p.join('|')] : [])))];
    const grad = (p: [string, string]) => `${gid}-g${used.indexOf(p.join('|'))}`;
    const t = b.labels ? resolveText(b.labels.style, defaults) : null;
    return (
      <g>
        <defs>
          {lk.hatch !== 'none' && <HatchPattern id={pat} h={lk.hatch} s={Math.max(1, lk.hatchSpacing)} color={hatchC} width={lk.hatchWidth} look={lk.hatchLook} />}
          {Array.from({ length: n }, (_, i) => (ownPat(i) && hatchOf(i) !== 'none' ? <HatchPattern key={i} id={patOf(i)} h={hatchOf(i)} s={Math.max(1, lk.hatchSpacing)} color={L(i)!.hatchColor || lk.hatchColor || edgeOf(i)} width={lk.hatchWidth} look={lk.hatchLook} /> : null))}
          <GradDefs keys={used} id={(k) => `${gid}-g${k}`} hor={hor} />
        </defs>
        {Array.from({ length: n }, (_, i) => {
          if (!ok(i) || val[i] === b.base[i]) return null;
          const r = box(i);
          const rx = lk.radius > 0 ? n2(Math.min(lk.radius, r.w / 2, r.h / 2)) : undefined;
          const col = colorOf(i);
          const p = pairs[i];
          const ew = ewOf(i);
          return (
            <g key={i}>
              {lk.shadow && <rect x={n2(r.x + 1.2)} y={n2(r.y + 1.2)} width={n2(r.w)} height={n2(r.h)} rx={rx} fill="#000000" fillOpacity={0.25} />}
              <rect x={n2(r.x)} y={n2(r.y)} width={n2(r.w)} height={n2(r.h)} rx={rx} fill={p ? `url(#${grad(p)})` : col} fillOpacity={L(i)?.opacity ?? st.fillOpacity} />
              {hatchOf(i) !== 'none' && <rect x={n2(r.x)} y={n2(r.y)} width={n2(r.w)} height={n2(r.h)} rx={rx} fill={`url(#${patOf(i)})`} />}
              {ew > 0 && <rect x={n2(r.x)} y={n2(r.y)} width={n2(r.w)} height={n2(r.h)} rx={rx} fill="none" stroke={edgeOf(i)} strokeWidth={ew} strokeDasharray={dashArray(lk.edgeDash, ew)} />}
            </g>
          );
        })}
        {b.err &&
          Array.from({ length: n }, (_, i) => {
            if (!ok(i)) return null;
            const [p, m] = [b.err!.plus[i] || 0, b.err!.minus[i] || 0];
            if (!(p > 0) && !(m > 0)) return null;
            const mid = (b.lo[i] + b.hi[i]) / 2;
            const cap = b.err!.cap / 2;
            const e = { stroke: L(i)?.err || b.err!.color || '#000000', strokeWidth: b.err!.width };
            if (hor) {
              const [y0, x1, x2] = [sy.f(mid), sx.f(val[i] - m), sx.f(val[i] + p)];
              return <path key={`e${i}`} d={`M${n2(x1)},${n2(y0)}H${n2(x2)}${cap ? `M${n2(x1)},${n2(y0 - cap)}V${n2(y0 + cap)}M${n2(x2)},${n2(y0 - cap)}V${n2(y0 + cap)}` : ''}`} {...e} fill="none" />;
            }
            const [x0, y1, y2] = [sx.f(mid), sy.f(val[i] - m), sy.f(val[i] + p)];
            return <path key={`e${i}`} d={`M${n2(x0)},${n2(y1)}V${n2(y2)}${cap ? `M${n2(x0 - cap)},${n2(y1)}H${n2(x0 + cap)}M${n2(x0 - cap)},${n2(y2)}H${n2(x0 + cap)}` : ''}`} {...e} fill="none" />;
          })}
        {b.labels &&
          t &&
          Array.from({ length: n }, (_, i) => {
            const text = b.labels!.text[i];
            if (!ok(i) || !text) return null;
            const r = box(i);
            const pos = b.labels!.pos;
            const pad = 2;
            // beyond the end of the bar (past its error bar), just inside its end, or at its middle
            if (hor) {
              const yc = r.y + r.h / 2;
              const end = pos === 'top' ? (b.err ? sx.f(val[i] + (val[i] >= b.base[i] ? b.err.plus[i] || 0 : -(b.err.minus[i] || 0))) : r.v1) : r.v1;
              const right = r.v1 >= r.v0;
              const x = pos === 'center' ? r.x + r.w / 2 : pos === 'inside' ? end + (right ? -pad : pad) : end + (right ? pad : -pad);
              const anchor = pos === 'center' ? 'middle' : (pos === 'inside') === right ? 'end' : 'start';
              return <RichText key={`l${i}`} x={x} y={yc} text={text} st={t} anchor={anchor} valign="middle" num />;
            }
            const xc = r.x + r.w / 2;
            const end = pos === 'top' && b.err ? sy.f(val[i] + (val[i] >= b.base[i] ? b.err.plus[i] || 0 : -(b.err.minus[i] || 0))) : r.v1;
            const above = r.v1 <= r.v0;
            const y = pos === 'center' ? r.y + r.h / 2 : pos === 'inside' ? end + (above ? pad : -pad) : end + (above ? -pad : pad);
            const valign = pos === 'center' ? 'middle' : (pos === 'inside') === above ? 'top' : 'bottom';
            return <RichText key={`l${i}`} x={xc} y={y} text={text} st={t} anchor="middle" valign={valign} num />;
          })}
      </g>
    );
  }
  // the steps: along the tops, down to the base at both ends (and where a bin is missing)
  const parts: string[] = [];
  let run: string[] = [];
  const flush = (i: number) => {
    if (run.length) parts.push(`${run.join('L')}L${n2(sx.f(b.hi[i]))},${n2(sy.f(b.base[i]))}`);
    run = [];
  };
  for (let i = 0; i < n; i++) {
    if (!ok(i)) {
      if (i > 0) flush(i - 1);
      continue;
    }
    if (!run.length) run.push(`M${n2(sx.f(b.lo[i]))},${n2(sy.f(b.base[i]))}`);
    run.push(`${n2(sx.f(b.lo[i]))},${n2(sy.f(val[i]))}`, `${n2(sx.f(b.hi[i]))},${n2(sy.f(val[i]))}`);
  }
  flush(n - 1);
  const d = parts.join('');
  const filled = b.look === 'stepfilled';
  return (
    <g>
      {lk.hatch !== 'none' && (
        <defs>
          <HatchPattern id={pat} h={lk.hatch} s={Math.max(1, lk.hatchSpacing)} color={hatchC} width={lk.hatchWidth} look={lk.hatchLook} />
        </defs>
      )}
      {filled && <path d={d} fill={fillC} fillOpacity={st.fillOpacity} stroke="none" />}
      {filled && lk.hatch !== 'none' && <path d={d} fill={`url(#${pat})`} stroke="none" />}
      <path d={d} fill="none" stroke={b.look === 'step' ? st.color : st.lineWidth > 0 ? edge : 'none'} strokeWidth={b.look === 'step' ? Math.max(st.lineWidth, 0.5) : st.lineWidth} strokeDasharray={dashArray(lk.edgeDash, Math.max(st.lineWidth, 0.5))} strokeLinejoin="miter" />
    </g>
  );
}

// Boxes and violins: the violin (whole or half; its quartile lines), the box (or its notch) with the median, the
// whiskers and their caps, the mean (a diamond), the outliers (open circles); the same hatching and gradient as bars.
function BoxesView({ c, sx, sy, gid }: { c: Curve; sx: Scale; sy: Scale; gid: string }) {
  const st = c.style;
  const B = c.boxes!;
  const lk = { ...BAR_LOOK_DEFAULTS, ...B.look };
  const hor = !!B.horizontal;
  // a point: across (category units), along (values)
  const P = (a: number, v: number) => (hor ? `${n2(sx.f(v))},${n2(sy.f(a))}` : `${n2(sx.f(a))},${n2(sy.f(v))}`);
  const edge0 = st.edgeColor || st.color;
  const edge = edge0;
  const pat = `${gid}-hatch`;
  const pairOf = (it: BoxItem) => gradPair(it.fill, it.fill2, lk);
  const used = [...new Set(B.items.flatMap((it) => pairOf(it)?.join('|') ?? []))];
  const fillOf = (it: BoxItem) => {
    const p = pairOf(it);
    return p ? `url(#${gid}-g${used.indexOf(p.join('|'))})` : it.fill;
  };
  // an item's own look (coloured by group): its opacity, edge, hatching, median
  const ownPat = (it: BoxItem) => !!it.look && (it.look.hatch !== undefined || !!it.look.hatchColor || !!it.look.edgeColor);
  const hatchOf = (it: BoxItem) => it.look?.hatch ?? lk.hatch;
  return (
    <g>
      <defs>
        {lk.hatch !== 'none' && <HatchPattern id={pat} h={lk.hatch} s={Math.max(1, lk.hatchSpacing)} color={lk.hatchColor || edge} width={lk.hatchWidth} look={lk.hatchLook} />}
        {B.items.map((it, i) => (ownPat(it) && hatchOf(it) !== 'none' ? <HatchPattern key={i} id={`${pat}-${i}`} h={hatchOf(it)} s={Math.max(1, lk.hatchSpacing)} color={it.look!.hatchColor || lk.hatchColor || it.look!.edgeColor || edge} width={lk.hatchWidth} look={lk.hatchLook} /> : null))}
        <GradDefs keys={used} id={(k) => `${gid}-g${k}`} hor={hor} />
      </defs>
      {B.items.map((it, i) => {
        const parts: ReactNode[] = [];
        const edge = it.look?.edgeColor || edge0;
        const lineW = it.look?.edgeWidth ?? st.lineWidth;
        const median = it.look?.median || B.median.color || '#000000';
        const hp = ownPat(it) ? `${pat}-${i}` : pat;
        const shape = (d: string, key: string) => {
          parts.push(<path key={`${key}f`} d={d} fill={fillOf(it)} fillOpacity={it.look?.opacity ?? st.fillOpacity} stroke="none" />);
          if (hatchOf(it) !== 'none') parts.push(<path key={`${key}h`} d={d} fill={`url(#${hp})`} stroke="none" />);
          if (lineW > 0) parts.push(<path key={`${key}e`} d={d} fill="none" stroke={edge} strokeWidth={lineW} strokeDasharray={dashArray(lk.edgeDash, lineW)} strokeLinejoin="round" />);
        };
        // the violin: its outline on one side or both
        const v = it.violin;
        if (v) {
          const hi = v.at.map((a, q) => P(it.pos + (it.side === 'low' ? 0 : v.w[q]), a));
          const lo = v.at.map((a, q) => P(it.pos - (it.side === 'high' ? 0 : v.w[q]), a)).reverse();
          shape(`M${hi.join('L')}L${lo.join('L')}Z`, 'v');
          // the quartiles across the violin: Q1, Q3 dashed, the median solid
          if (it.quartiles) {
            const wAt = (y: number) => {
              let k = v.at.findIndex((a) => a >= y);
              if (k <= 0) return v.w[Math.max(0, k)] ?? 0;
              const t = (y - v.at[k - 1]) / (v.at[k] - v.at[k - 1]);
              return v.w[k - 1] + t * (v.w[k] - v.w[k - 1]);
            };
            it.quartiles.forEach((y, q) => {
              const w = wAt(y);
              parts.push(<path key={`q${q}`} d={`M${P(it.pos - (it.side === 'high' ? 0 : w), y)}L${P(it.pos + (it.side === 'low' ? 0 : w), y)}`} stroke={q === 1 ? median : edge} strokeWidth={q === 1 ? B.median.width : Math.max(0.5, lineW)} strokeDasharray={q === 1 ? undefined : dashArray('dash', Math.max(0.5, lineW))} fill="none" />);
            });
          }
        }
        const b = it.box;
        if (b) {
          const [a, w] = [b.at, b.half];
          // the whiskers and their caps, under the box
          const cap = w * 0.5;
          parts.push(<path key="w" d={`M${P(a, b.q1)}L${P(a, b.wlo)}M${P(a, b.q3)}L${P(a, b.whi)}M${P(a - cap, b.wlo)}L${P(a + cap, b.wlo)}M${P(a - cap, b.whi)}L${P(a + cap, b.whi)}`} stroke={edge} strokeWidth={Math.max(0.5, lineW)} fill="none" />);
          // the box, or its notched outline (narrowed to half at the median)
          const n = b.notch;
          const d = n
            ? `M${[P(a - w, b.q1), P(a - w, n[0]), P(a - w / 2, b.med), P(a - w, n[1]), P(a - w, b.q3), P(a + w, b.q3), P(a + w, n[1]), P(a + w / 2, b.med), P(a + w, n[0]), P(a + w, b.q1)].join('L')}Z`
            : `M${[P(a - w, b.q1), P(a - w, b.q3), P(a + w, b.q3), P(a + w, b.q1)].join('L')}Z`;
          if (v) parts.push(<path key="bb" d={d} fill="#ffffff" fillOpacity={0.85} stroke="none" />);
          if (v) parts.push(<path key="be" d={d} fill={it.fill} fillOpacity={0.35} stroke={edge} strokeWidth={Math.max(0.5, lineW)} />);
          else shape(d, 'b');
          const mw = n ? w / 2 : w;
          parts.push(<path key="m" d={`M${P(a - mw, b.med)}L${P(a + mw, b.med)}`} stroke={median} strokeWidth={B.median.width} fill="none" />);
        }
        // the mean: a small diamond
        if (it.mean !== undefined && Number.isFinite(it.mean)) {
          const [mx, my] = hor ? [sx.f(it.mean), sy.f(b?.at ?? it.pos)] : [sx.f(b?.at ?? it.pos), sy.f(it.mean)];
          parts.push(<path key="mean" d={`M${n2(mx)},${n2(my - 3)}L${n2(mx + 3)},${n2(my)}L${n2(mx)},${n2(my + 3)}L${n2(mx - 3)},${n2(my)}Z`} fill="#ffffff" stroke="#000000" strokeWidth={0.6} />);
        }
        // the outliers: open circles
        for (const [q, y] of (it.outliers ?? []).entries()) {
          const [ox, oy] = hor ? [sx.f(y), sy.f(b?.at ?? it.pos)] : [sx.f(b?.at ?? it.pos), sy.f(y)];
          parts.push(<circle key={`o${q}`} cx={n2(ox)} cy={n2(oy)} r={2.2} fill="none" stroke={edge} strokeWidth={0.6} />);
        }
        return <g key={i}>{parts}</g>;
      })}
    </g>
  );
}

// A pie / doughnut: every slice an annular sector around the frame's centre (moved out along its middle when exploded),
// with the hatching and edge of its own look; the labels inside the slice or outside on a leader line (pushed apart on
// each side so they do not overlap); a text in the centre.
function WedgesView({ c, frame, defaults, gid }: { c: Curve; frame: Box; defaults: TextDefaults; gid: string }) {
  const st = c.style;
  const W = c.wedges!;
  const [cx, cy] = [frame.x + frame.w * Math.min(1, Math.max(0, W.at ?? 0.5)), frame.y + frame.h / 2];
  const t = resolveText(W.labelStyle, { ...defaults, size: defaults.size * 0.9 });
  // the radius: within the frame from the centre, leaving room for the slices moved out and the labels outside
  const outText = (it: WedgeItem) => it.outer ?? (it.outside ? it.label : undefined);
  const outs = W.items.filter((it) => outText(it));
  // the widest label on each side (left of the centre, right of it)
  const widest = (right: boolean) => Math.max(0, maxOf(outs.filter((it) => Math.cos(((it.a0 + it.a1) * Math.PI) / 360) >= 0 === right).map((it) => richMetrics(outText(it)!, t).width + 8)));
  const grow = 1 + Math.max(0, maxOf(W.items.map((it) => it.explode))) + (outs.length ? 0.13 : 0);
  const roomX = Math.min(cx - frame.x - widest(false), frame.x + frame.w - cx - widest(true));
  const roomY = frame.h / 2 - (outs.length ? t.size : 0);
  const R = Math.max(5, Math.min(roomX, roomY) / grow) * Math.min(1, Math.max(0.1, W.size));
  const rad = (a: number) => (a * Math.PI) / 180;
  const at = (a: number, r: number, o: [number, number]): [number, number] => [o[0] + r * Math.cos(rad(a)), o[1] - r * Math.sin(rad(a))];
  const pt = (p: [number, number]) => `${n2(p[0])},${n2(p[1])}`;
  const edge0 = st.edgeColor || '#ffffff';
  const pat = `${gid}-hatch`;
  const slices = W.items.map((it, i) => {
    const mid = (it.a0 + it.a1) / 2;
    const o = it.explode > 0 ? at(mid, it.explode * R, [cx, cy]) : ([cx, cy] as [number, number]);
    const [r0, r1] = [it.r0 * R, it.r1 * R];
    const span = it.a1 - it.a0;
    let d: string;
    if (span >= 359.999) {
      // a whole ring: two half circles (an SVG arc cannot close on itself)
      const ring = (r: number, sweep: 0 | 1) => `M${pt(at(0, r, o))}A${n2(r)},${n2(r)} 0 1 ${sweep} ${pt(at(180, r, o))}A${n2(r)},${n2(r)} 0 1 ${sweep} ${pt(at(0, r, o))}Z`;
      d = ring(r1, 0) + (r0 > 0 ? ring(r0, 1) : '');
    } else {
      const large = span > 180 ? 1 : 0;
      d = `M${pt(at(it.a0, r1, o))}A${n2(r1)},${n2(r1)} 0 ${large} 0 ${pt(at(it.a1, r1, o))}` + (r0 > 0 ? `L${pt(at(it.a1, r0, o))}A${n2(r0)},${n2(r0)} 0 ${large} 1 ${pt(at(it.a0, r0, o))}Z` : `L${pt(o)}Z`);
    }
    return { it, i, d, mid, o, r0, r1 };
  });
  // the labels: inside at the middle of the slice; outside past its edge, then pushed apart on each side
  const inside = slices.filter((s) => s.it.label && !s.it.outside);
  const out = slices
    .filter((s) => outText(s.it))
    .map((s) => {
      const e = at(s.mid, s.r1, s.o);
      const k = at(s.mid, s.r1 + Math.max(6, 0.08 * R), s.o);
      return { s, e, k, right: Math.cos(rad(s.mid)) >= 0, y: k[1] };
    });
  const gap = t.size * 1.15;
  for (const side of [true, false]) {
    const list = out.filter((l) => l.right === side).sort((a, b) => a.y - b.y);
    for (let j = 1; j < list.length; j++) if (list[j].y - list[j - 1].y < gap) list[j].y = list[j - 1].y + gap;
  }
  return (
    <g>
      <defs>
        {slices.map(({ it, i }) => {
          const h = it.look?.hatch;
          return h && h !== 'none' ? <HatchPattern key={i} id={`${pat}-${i}`} h={h} s={4} color={it.look?.hatchColor || it.look?.edgeColor || edge0} width={0.6} /> : null;
        })}
      </defs>
      {slices.map(({ it, i, d }) => {
        const ew = it.look?.edgeWidth ?? st.lineWidth;
        return (
          <g key={i}>
            <path d={d} fill={it.fill} fillOpacity={it.look?.opacity ?? st.fillOpacity} fillRule="evenodd" stroke="none" />
            {it.look?.hatch && it.look.hatch !== 'none' && <path d={d} fill={`url(#${pat}-${i})`} fillRule="evenodd" stroke="none" />}
            {ew > 0 && <path d={d} fill="none" stroke={it.look?.edgeColor || edge0} strokeWidth={ew} strokeLinejoin="round" />}
          </g>
        );
      })}
      {inside.map((s) => {
        const r = s.r0 > 0 ? (s.r0 + s.r1) / 2 : s.r1 * 0.62;
        const p = at(s.mid, r, s.o);
        return <RichText key={`i${s.i}`} x={p[0]} y={p[1]} text={s.it.label!} st={t} anchor="middle" valign="middle" num />;
      })}
      {out.map((l) => {
        const end = l.k[0] + (l.right ? 1 : -1) * Math.max(4, 0.05 * R);
        return (
          <g key={`o${l.s.i}`}>
            <path d={`M${pt(l.e)}L${n2(l.k[0])},${n2(l.y)}L${n2(end)},${n2(l.y)}`} fill="none" stroke={t.color} strokeOpacity={0.6} strokeWidth={0.5} />
            <RichText x={end + (l.right ? 2 : -2)} y={l.y} text={outText(l.s.it)!} st={t} anchor={l.right ? 'start' : 'end'} valign="middle" num />
          </g>
        );
      })}
      {W.center?.length
        ? W.center.map((line, j) => {
            const ct = resolveText(W.centerStyle, defaults);
            return <RichText key={`c${j}`} x={cx} y={cy + (j - (W.center!.length - 1) / 2) * ct.size * 1.2} text={line} st={ct} anchor="middle" valign="middle" num />;
          })
        : null}
    </g>
  );
}

// A polar / radar chart: the sector fitted in the frame; the grid (circles or polygons at the values of r, spokes), the
// labels of θ outside and of r along a spoke; every series — bars as wedges, the fill to the centre, the line (drawn
// along θ in steps of 2° at most: equal r is an arc; a radar's straight), the symbols.
function PolarView({ c, frame, defaults }: { c: Curve; frame: Box; defaults: TextDefaults }) {
  const P = c.polar!;
  const t = resolveText(undefined, { ...defaults, size: defaults.size * 0.9 });
  const [s0, s1] = P.sector;
  const full = s1 - s0 >= 359.999;
  // screen angle (radians, counterclockwise from the right) of a θ
  const ang = (th: number) => (((P.zero === 'N' ? 90 : 0) + (P.clockwise ? -1 : 1) * th) * Math.PI) / 180;
  // the sector's extent in units of the radius (with the centre), then fitted in the frame, room left for the labels
  const samples = full ? [0, 90, 180, 270] : Array.from({ length: 37 }, (_, k) => s0 + ((s1 - s0) * k) / 36);
  const ux = [0, ...samples.map((th) => Math.cos(ang(th)))];
  const uy = [0, ...samples.map((th) => Math.sin(ang(th)))];
  const [bx0, bx1, by0, by1] = [minOf(ux), maxOf(ux), minOf(uy), maxOf(uy)];
  // room for the labels of θ: across, the widest one (a radar's categories); along, a line of text
  const labelled = P.thetaLabels !== 'none' || !!P.spokes;
  const padX = !labelled ? 4 : P.spokes ? maxOf(P.spokes.map((s) => richMetrics(s, t).width)) + t.size : t.size * 2.6;
  const padY = !labelled ? 4 : t.size * 2;
  const R = Math.max(5, Math.min((frame.w - 2 * padX) / (bx1 - bx0 || 1), (frame.h - 2 * padY) / (by1 - by0 || 1)));
  const cx = frame.x + padX - bx0 * R + (frame.w - 2 * padX - (bx1 - bx0) * R) / 2;
  const cy = frame.y + padY + by1 * R + (frame.h - 2 * padY - (by1 - by0) * R) / 2;
  const rad = (r: number) => (Math.max(P.lo, Math.min(P.hi, r)) - P.lo) / (P.hi - P.lo || 1);
  const at = (th: number, r: number): [number, number] => [cx + rad(r) * R * Math.cos(ang(th)), cy - rad(r) * R * Math.sin(ang(th))];
  const pt = (p: [number, number]) => `${n2(p[0])},${n2(p[1])}`;
  const grid = c.style.color;
  // the spokes: every thetaStep degrees in the sector (or the radar's categories)
  const spokes: number[] = [];
  for (let th = s0; th < s1 + 1e-9 && spokes.length < 400; th += P.thetaStep) if (!(full && th >= s0 + 360 - 1e-9)) spokes.push(th);
  // a ring of the grid at r: a circle (an arc on a sector) or a polygon through the spokes
  const ring = (r: number) => {
    if (P.gridShape === 'polygon') return `M${spokes.map((th) => pt(at(th, r))).join('L')}Z`;
    const pts = Array.from({ length: 121 }, (_, k) => s0 + ((s1 - s0) * k) / 120).map((th) => pt(at(th, r)));
    return `M${pts.join('L')}${full ? 'Z' : ''}`;
  };
  const thetaText = (th: number, k: number) => {
    if (P.spokes) return P.spokes[k] ?? '';
    const v = ((th % 360) + 360) % 360;
    // compass: θ as a bearing (0 = N, 90 = E …; meant with 0° at the top, clockwise)
    if (P.thetaLabels === 'compass') return Math.abs(v / 45 - Math.round(v / 45)) < 1e-9 ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(v / 45) % 8] : `${+v.toFixed(1)}°`;
    if (P.thetaLabels === 'rad') {
      const q = v / 180;
      const frac = (n: number, dd: number) => (n === 0 ? '0' : `${n === 1 ? '' : n}π${dd === 1 ? '' : `/${dd}`}`);
      for (const dd of [1, 2, 3, 4, 6, 12]) if (Math.abs(q * dd - Math.round(q * dd)) < 1e-9) return frac(Math.round(q * dd), dd);
      return (v / R2D_).toFixed(2);
    }
    return `${+v.toFixed(1)}°`;
  };
  const fmtR = (v: number) => String(+v.toPrecision(6)).replace('-', '−');
  return (
    <g>
      {/* the grid */}
      {P.rTicks.map((r) => (
        <path key={`r${r}`} d={ring(r)} fill="none" stroke={grid} strokeWidth={0.5} />
      ))}
      <path d={ring(P.hi)} fill="none" stroke={grid} strokeWidth={0.8} />
      {spokes.map((th) => (
        <path key={`s${th}`} d={`M${pt(at(th, P.lo))}L${pt(at(th, P.hi))}`} stroke={grid} strokeWidth={0.5} />
      ))}
      {!full && [s0, s1].map((th) => <path key={`e${th}`} d={`M${pt(at(th, P.lo))}L${pt(at(th, P.hi))}`} stroke={grid} strokeWidth={0.8} />)}
      {/* the series */}
      {P.series.map((s, j) => {
        const pts = s.theta.map((th, i) => (Number.isFinite(th) && Number.isFinite(s.r[i]) ? at(th, s.r[i]) : null));
        const parts: ReactNode[] = [];
        if (s.mode === 'bars') {
          // a wedge from the centre's value to r, as wide as the step between the angles (or as chosen)
          const steps = s.theta.slice(1).map((th, i) => Math.abs(th - s.theta[i])).filter((v) => v > 0);
          const w = s.barWidth || (steps.length ? minOf(steps) * 0.9 : 10);
          s.theta.forEach((th, i) => {
            const r = s.r[i];
            if (!Number.isFinite(th) || !Number.isFinite(r) || rad(r) <= 0) return;
            const arc = Array.from({ length: 9 }, (_, k) => th - w / 2 + (w * k) / 8);
            const d = `M${pt(at(th - w / 2, P.lo))}L${arc.map((a) => pt(at(a, r))).join('L')}L${pt(at(th + w / 2, P.lo))}Z`;
            parts.push(<path key={`b${i}`} d={d} fill={s.color} fillOpacity={Math.max(0.6, s.opacity)} stroke={s.showLine ? '#ffffff' : 'none'} strokeWidth={0.5} />);
          });
          return <g key={j}>{parts}</g>;
        }
        // the line: along θ in small steps (a radar: straight between its spokes)
        const path: string[] = [];
        const order = s.theta.map((_, i) => i);
        const seq = s.close && order.length > 2 ? [...order, order[0]] : order;
        let run = '';
        for (let q = 0; q < seq.length; q++) {
          const i = seq[q];
          if (!pts[i]) {
            if (run) path.push(run);
            run = '';
            continue;
          }
          if (!run) {
            run = `M${pt(pts[i]!)}`;
            continue;
          }
          const k = seq[q - 1];
          let [t0, t1] = [s.theta[k], s.theta[i]];
          if (q === seq.length - 1 && s.close && Math.abs(t1 + 360 - t0) < Math.abs(t1 - t0)) t1 += 360;
          const n = P.spokes ? 1 : Math.max(1, Math.ceil(Math.abs(t1 - t0) / 2));
          for (let m = 1; m <= n; m++) {
            const f = m / n;
            run += `L${pt(at(t0 + (t1 - t0) * f, s.r[k] + (s.r[i] - s.r[k]) * f))}`;
          }
        }
        if (run) path.push(run);
        const d = path.join('');
        if (s.fill && d) parts.push(<path key="f" d={s.close ? d : `${d}L${pt([cx, cy])}Z`} fill={s.color} fillOpacity={s.opacity} stroke="none" />);
        if (s.showLine && s.mode !== 'scatter' && d) parts.push(<path key="l" d={d} fill="none" stroke={s.color} strokeWidth={s.lineWidth} strokeDasharray={dashArray(s.dash, s.lineWidth)} strokeLinejoin="round" />);
        if (s.showPoints && (s.mode === 'scatter' || s.mode === 'linesymbol'))
          pts.forEach((p, i) => {
            if (p) parts.push(<path key={`p${i}`} d={symbolPath(s.symbol, s.symbolSize, p[0], p[1])} fill={s.symbolFill === 'open' ? 'none' : s.symbolFill === 'white' ? '#ffffff' : s.color} stroke={s.color} strokeWidth={0.75} />);
          });
        return <g key={j}>{parts}</g>;
      })}
      {/* the labels: θ outside the rim, r along a spoke */}
      {P.thetaLabels !== 'none' || P.spokes
        ? spokes.map((th, k) => {
            const a = ang(th);
            const [x, y] = [cx + (R + t.size * 0.6) * Math.cos(a), cy - (R + t.size * 0.6) * Math.sin(a)];
            const ca = Math.cos(a);
            return <RichText key={`t${th}`} x={x} y={y} text={thetaText(th, k)} st={t} anchor={Math.abs(ca) < 0.2 ? 'middle' : ca > 0 ? 'start' : 'end'} valign={Math.sin(a) > 0.3 ? 'bottom' : Math.sin(a) < -0.3 ? 'top' : 'middle'} />;
          })
        : null}
      {P.rTicks.map((r) => {
        const [x, y] = at(P.rLabelAngle, r);
        return <RichText key={`rl${r}`} x={x + 2} y={y - 1} text={fmtR(r)} st={t} anchor="start" valign="bottom" num />;
      })}
    </g>
  );
}
const R2D_ = 180 / Math.PI;

// A ternary chart: an equilateral triangle fitted in the frame (A at the top, B bottom left, C bottom right), the grid
// every step (lines of equal A, B, C), the values along the edges (A on the left, B at the bottom, C on the right, each
// tilted to its lines), the names at the corners; every series' line and symbols.
function TernaryView({ c, frame, defaults }: { c: Curve; frame: Box; defaults: TextDefaults }) {
  const T = c.ternary!;
  const t = resolveText(undefined, { ...defaults, size: defaults.size * 0.85 });
  const tt = resolveText(undefined, defaults);
  const h3 = Math.sqrt(3) / 2;
  // the triangle's side: as large as fits with room around for the values (beside the edges) and the names (above the
  // top corner, under the bottom ones)
  const padX = t.size * 2.6 + 3;
  const padTop = tt.size * 1.8;
  const padBottom = t.size * 1.3 + tt.size * 1.6;
  const side = Math.max(10, Math.min(frame.w - 2 * padX, (frame.h - padTop - padBottom) / h3));
  const x0 = frame.x + (frame.w - side) / 2;
  const y0 = frame.y + padTop + side * h3 + (frame.h - padTop - padBottom - side * h3) / 2; // the bottom edge
  // (B is what is left: a + b + c = 1)
  const P = (a: number, _b: number, cc: number): [number, number] => [x0 + side * (cc + a / 2), y0 - side * a * h3];
  const pt = (p: [number, number]) => `${n2(p[0])},${n2(p[1])}`;
  const steps: number[] = [];
  for (let k = 1; k * T.step < 1 - 1e-9; k++) steps.push(+(k * T.step).toPrecision(10));
  const lab = (v: number) => (T.percent ? String(+(v * 100).toPrecision(6)) : String(+v.toPrecision(6)));
  const grid = c.style.color;
  return (
    <g>
      {/* the grid: equal A (parallel to BC), equal B (parallel to CA), equal C (parallel to AB) */}
      {steps.map((f) => (
        <g key={`g${f}`}>
          <path d={`M${pt(P(f, 1 - f, 0))}L${pt(P(f, 0, 1 - f))}`} stroke={grid} strokeWidth={0.5} />
          <path d={`M${pt(P(0, f, 1 - f))}L${pt(P(1 - f, f, 0))}`} stroke={grid} strokeWidth={0.5} />
          <path d={`M${pt(P(1 - f, 0, f))}L${pt(P(0, 1 - f, f))}`} stroke={grid} strokeWidth={0.5} />
        </g>
      ))}
      <path d={`M${pt(P(1, 0, 0))}L${pt(P(0, 1, 0))}L${pt(P(0, 0, 1))}Z`} fill="none" stroke="#000000" strokeWidth={0.8} strokeLinejoin="round" />
      {/* the values: A along the left edge, B along the bottom, C along the right */}
      {/* one value a corner: 1 (100 %) of its own part, not 0 of the next */}
      {[...steps, 1].map((f) => {
        const [ax, ay] = P(f, 1 - f, 0);
        const [bx, by] = P(0, f, 1 - f);
        const [cx2, cy2] = P(1 - f, 0, f);
        return (
          <g key={`l${f}`}>
            <RichText x={ax - 3} y={ay} text={lab(f)} st={t} anchor="end" valign="middle" num />
            <RichText x={bx} y={by + 3} text={lab(f)} st={t} anchor="middle" valign="top" num />
            <RichText x={cx2 + 3} y={cy2} text={lab(f)} st={t} anchor="start" valign="middle" num />
          </g>
        );
      })}
      {/* the names at the corners */}
      <RichText x={P(1, 0, 0)[0]} y={P(1, 0, 0)[1] - tt.size * 0.6} text={T.names[0]} st={tt} anchor="middle" valign="bottom" />
      <RichText x={P(0, 1, 0)[0]} y={P(0, 1, 0)[1] + t.size * 1.3 + 2} text={T.names[1]} st={tt} anchor="middle" valign="top" />
      <RichText x={P(0, 0, 1)[0]} y={P(0, 0, 1)[1] + t.size * 1.3 + 2} text={T.names[2]} st={tt} anchor="middle" valign="top" />
      {/* the series */}
      {T.series.map((s, j) => {
        const pts = s.a.map((a, i) => (Number.isFinite(a) ? P(a, s.b[i], s.c[i]) : null));
        const parts: ReactNode[] = [];
        if (s.showLine && s.mode !== 'scatter') {
          let d = '';
          let open = false;
          for (const p of pts) {
            if (!p) {
              open = false;
              continue;
            }
            d += `${open ? 'L' : 'M'}${pt(p)}`;
            open = true;
          }
          if (d) parts.push(<path key="l" d={d} fill="none" stroke={s.color} strokeWidth={s.lineWidth} strokeDasharray={dashArray(s.dash, s.lineWidth)} strokeLinejoin="round" />);
        }
        if (s.showPoints && s.mode !== 'line')
          pts.forEach((p, i) => {
            if (p) {
              const col = s.colors?.[i] ?? s.color;
              parts.push(<path key={`p${i}`} d={symbolPath(s.symbol, s.symbolSize, p[0], p[1])} fill={s.symbolFill === 'open' ? 'none' : s.symbolFill === 'white' ? '#ffffff' : col} stroke={col} strokeWidth={0.75} />);
            }
          });
        return <g key={j}>{parts}</g>;
      })}
    </g>
  );
}

// Z on a grid: a picture of its cells (a pixel each, or finer — bilinear — when smooth or filled by levels) stretched
// over the cells' extent when the grid is even and the axes linear; else a rectangle a cell. Filled: every value
// coloured by the band between two levels (its middle).
const gridPictures = new WeakMap<object, string>();
function GridView({ c, sx, sy }: { c: Curve; sx: Scale; sy: Scale }) {
  const G = c.grid!;
  const st = c.style;
  const { xs, ys, z } = G;
  const [nx, ny] = [xs.length, ys.length];
  const stops = stopsOf(st.cmap, st.cmapColors);
  const [lo, hi] = G.range;
  const lv = G.levels;
  // the colours, looked up (not computed for every cell): 1024 steps of the map, or one colour a band between levels
  // (filled: the middle of the band)
  const lut = Array.from({ length: 1024 }, (_, k) => mapColor(stops, k / 1023));
  const bands =
    G.mode === 'filled' && lv.length
      ? Array.from({ length: lv.length + 1 }, (_, k) => {
          const a = k === 0 ? lo : lv[k - 1];
          const b = k === lv.length ? hi : lv[k];
          return mapColor(stops, mapT(st.cmapLog && a > 0 && b > 0 ? Math.sqrt(a * b) : (a + b) / 2, lo, hi, st.cmapLog, st.cmapReverse));
        })
      : null;
  const toNum = (h: string) => parseInt(h.replace('#', ''), 16);
  const lutN = (bands ?? lut).map(toNum);
  const nanN = /^#[0-9a-f]{6}$/i.test(G.nan) ? toNum(G.nan) : -1;
  // a value → the index of its colour (−1: none — also a value hidden by the cut, tested after the smooth
  // interpolation so that the edge of what is hidden follows the threshold, not the cells)
  const cut = G.cut;
  const indexAt = (v: number) => {
    if (!Number.isFinite(v) || (cut && !(v >= cut[0] && v <= cut[1]))) return -1;
    if (bands) {
      let k = 0;
      while (k < lv.length && v >= lv[k]) k++;
      return k;
    }
    return Math.round(mapT(v, lo, hi, st.cmapLog, st.cmapReverse) * 1023);
  };
  const colorAt = (v: number) => {
    const k = indexAt(v);
    return k < 0 ? G.nan || null : (bands ?? lut)[k];
  };
  // the cells' edges: halfway between the points, half a step past the ends
  const ex = cellEdges(xs);
  const ey = cellEdges(ys);
  const even = (v: number[]) => v.every((q, k) => k === 0 || Math.abs(q - v[k - 1] - (v[1] - v[0])) <= 1e-6 * Math.abs(v[1] - v[0]));
  const linear = (s: Scale) => s.spec.scale === 'linear' && !s.gaps.length;
  if (typeof document !== 'undefined' && even(xs) && even(ys) && linear(sx) && linear(sy)) {
    let url = gridPictures.get(G);
    if (!url) {
      const k = G.smooth || G.mode === 'filled' ? Math.max(1, Math.min(8, Math.ceil(480 / Math.max(nx, ny)))) : 1;
      const [W, H] = [nx * k, ny * k];
      const cv = document.createElement('canvas');
      [cv.width, cv.height] = [W, H];
      const ctx = cv.getContext('2d')!;
      const img = ctx.createImageData(W, H);
      const at = (i: number, j: number) => z[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
      for (let py = 0; py < H; py++)
        for (let px = 0; px < W; px++) {
          // the value at this pixel: its cell's (sharp), or bilinear between the points (smooth / filled)
          let v: number;
          if (k === 1) v = at(px, py);
          else {
            const gx = (px + 0.5) / k - 0.5;
            const gy = (py + 0.5) / k - 0.5;
            const [i0, j0] = [Math.floor(gx), Math.floor(gy)];
            const [fx, fy] = [gx - i0, gy - j0];
            const q = [at(i0, j0), at(i0 + 1, j0), at(i0, j0 + 1), at(i0 + 1, j0 + 1)];
            v = q.some((w) => !Number.isFinite(w)) ? at(Math.round(gx), Math.round(gy)) : q[0] * (1 - fx) * (1 - fy) + q[1] * fx * (1 - fy) + q[2] * (1 - fx) * fy + q[3] * fx * fy;
          }
          const ci = indexAt(v);
          const n = ci < 0 ? nanN : lutN[ci];
          const o = ((H - 1 - py) * W + px) * 4; // the picture's first row is the top (the largest Y)
          if (n < 0) continue;
          img.data[o] = n >> 16;
          img.data[o + 1] = (n >> 8) & 255;
          img.data[o + 2] = n & 255;
          img.data[o + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
      url = cv.toDataURL('image/png');
      gridPictures.set(G, url);
    }
    const [x0, x1] = [sx.f(ex[0]), sx.f(ex[nx])];
    const [y0, y1] = [sy.f(ey[0]), sy.f(ey[ny])];
    // a reversed axis: the picture turned over about its centre
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
    return <image href={url} x={n2(Math.min(x0, x1))} y={n2(Math.min(y0, y1))} width={n2(Math.abs(x1 - x0))} height={n2(Math.abs(y1 - y0))} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }} transform={x1 < x0 || y1 > y0 ? `translate(${n2(cx)},${n2(cy)}) scale(${x1 < x0 ? -1 : 1},${y1 > y0 ? -1 : 1}) translate(${n2(-cx)},${n2(-cy)})` : undefined} />;
  }
  // a rectangle a cell (uneven grid, log axes)
  const cells: ReactNode[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const col = colorAt(z[j * nx + i]);
      if (!col) continue;
      const [a, b, cc, dd] = [sx.f(ex[i]), sx.f(ex[i + 1]), sy.f(ey[j]), sy.f(ey[j + 1])];
      if (![a, b, cc, dd].every(Number.isFinite)) continue;
      cells.push(<rect key={j * nx + i} x={n2(Math.min(a, b))} y={n2(Math.min(cc, dd))} width={n2(Math.abs(b - a) + 0.3)} height={n2(Math.abs(dd - cc) + 0.3)} fill={col} />);
    }
  return <g>{cells}</g>;
}

// The points of a curve drawn: those on the axes (idx), the runs of consecutive ones a line joins (it breaks where a
// point is missing or over a break of an axis), the masked ones (Data manipulation: drawn grey or not at all). Kept
// for the two passes of a curve (under and over the others) with the same scales.
const pointsMemo = new WeakMap<Curve, { sx: Scale; sy: Scale; p: { idx: number[]; runs: number[][]; faded: number[] } }>();
function pointsOf(c: Curve, sx: Scale, sy: Scale) {
  const hit = pointsMemo.get(c);
  if (hit && hit.sx === sx && hit.sy === sy) return hit.p;
  const xv = c.series.x.values;
  const yv = c.series.y.values;
  const n = Math.min(xv.length, yv.length);
  // linear axes without breaks: a point is on them when it is finite (no call per point — a million points fast)
  const plain = (s: Scale) => s.spec.scale === 'linear' && !s.gaps.length && !parseBreaks(s.spec.breaks).length;
  const fast = plain(sx) && plain(sy);
  const broken = sx.gaps.length > 0 || sy.gaps.length > 0;
  const idx: number[] = [];
  const runs: number[][] = [];
  let run: number[] = [];
  const faded: number[] = [];
  const { mask } = c;
  const hideMasked = c.style.masked === 'hidden';
  for (let i = 0; i < n; i++) {
    const good = fast ? Number.isFinite(xv[i]) && Number.isFinite(yv[i]) : validFor(sx.spec, xv[i]) && validFor(sy.spec, yv[i]);
    if (good) {
      if (mask?.[i]) {
        if (!hideMasked) faded.push(i);
        continue;
      }
      idx.push(i);
      // over a break of an axis: the line stops on one side and starts again on the other
      if (broken && run.length) {
        const prev = run[run.length - 1];
        if (sx.seg(xv[prev]) !== sx.seg(xv[i]) || sy.seg(yv[prev]) !== sy.seg(yv[i])) {
          runs.push(run);
          run = [];
        }
      }
      run.push(i);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  const p = { idx, runs, faded };
  pointsMemo.set(c, { sx, sy, p });
  return p;
}

function CurveView({ c, sx, sy, frame, defaults, below, others = [], gid = 'c' }: { c: Curve; sx: Scale; sy: Scale; frame: Box; defaults: TextDefaults; below: boolean; others?: Curve[]; gid?: string }) {
  const st = c.style;
  if (st.show === false) return null;
  if (c.grid) return below ? <GridView c={c} sx={sx} sy={sy} /> : null;
  if (c.polar) return below ? null : <PolarView c={c} frame={frame} defaults={defaults} />;
  if (c.ternary) return below ? null : <TernaryView c={c} frame={frame} defaults={defaults} />;
  if (c.three) return below ? null : <ThreeView c={c} frame={frame} defaults={defaults} />;
  if (c.wedges) return below ? null : <WedgesView c={c} frame={frame} defaults={defaults} gid={`${gid}-${c.key.replace(/[^\w-]/g, '_')}`} />;
  if (c.boxes) return below ? null : <BoxesView c={c} sx={sx} sy={sy} gid={`${gid}-${c.key.replace(/[^\w-]/g, '_')}`} />;
  if (c.bars) return below ? null : <BarsView c={c} sx={sx} sy={sy} gid={`${gid}-${c.key.replace(/[^\w-]/g, '_')}`} defaults={defaults} />;
  const { x, y, yErr, xErr } = c.series;
  const { idx, runs, faded } = pointsOf(c, sx, sy);
  const colors = pointColors(c);
  const lineColored = colors && st.colorTarget !== 'symbols';
  const symColored = colors && st.colorTarget !== 'line';
  const baseY = st.fill === 'zero' ? Math.min(frame.y + frame.h, Math.max(frame.y, validFor(sy.spec, 0) ? sy.f(0) : frame.y + frame.h)) : frame.y + frame.h;
  const errC = st.errColor || st.color;
  const parts: ReactNode[] = [];
  // the fill under the curve (under every line; or, fillOver, with its own line: it hides the curves drawn before)
  const drawFill = () => {
      const to = st.fill === 'zero' || st.fill === 'bottom' ? null : fillLine(c, others);
      // a line y(x) below (or above) the curve: back along it; else straight down to y = 0 or the frame
      const clampY = (v: number) => Math.min(frame.y + frame.h + 1, Math.max(frame.y - 1, v));
      runs.forEach((r, k) => {
        if (r.length < 2) return;
        const px = r.map((i) => sx.f(x.values[i]));
        const py = r.map((i) => sy.f(y.values[i]));
        let back = `L${n2(px[px.length - 1])},${n2(baseY)}L${n2(px[0])},${n2(baseY)}Z`;
        if (to) {
          const bs = r.map((i) => to(x.values[i])).map((v) => (validFor(sy.spec, v) ? clampY(sy.f(v)) : baseY));
          back = `${r.map((_, j) => r.length - 1 - j).map((j) => `L${n2(px[j])},${n2(bs[j])}`).join('')}Z`;
        }
        parts.push(<path key={`f${k}`} d={`${linePath(c, px, py)}${back}`} fill={st.fillColor || st.color} fillOpacity={st.fillOpacity} stroke="none" />);
        if (st.fillHatch && st.fillHatch !== 'none') parts.push(<path key={`fh${k}`} d={`${linePath(c, px, py)}${back}`} fill={`url(#${gid}-fh)`} stroke="none" />);
      });
      if (st.fillHatch && st.fillHatch !== 'none')
        parts.push(
          <defs key="fhd">
            <HatchPattern id={`${gid}-fh`} h={st.fillHatch} s={4} color={st.fillHatchColor || st.color} width={0.6} look={st.fillHatchLook} />
          </defs>,
        );
  };
  if (!below && st.fillOver && st.fill !== 'none') drawFill();
  if (below) {
    // the fill under the curve and the error band go under every line
    if (st.fill !== 'none' && !st.fillOver) drawFill();
    if (yErr && st.errStyle === 'band')
      runs.forEach((r, k) => {
        const good = r.filter((i) => Number.isFinite(yErr.values[i]));
        if (good.length < 2) return;
        const e = (i: number) => Math.abs(yErr.values[i]);
        const eLo = (i: number) => Math.abs((c.series.yErrLo ?? yErr).values[i]);
        const lowOf = (i: number) => {
          const v = y.values[i] - (st.errDir === 'plus' ? 0 : eLo(i));
          return validFor(sy.spec, v) ? sy.f(v) : frame.y + frame.h;
        };
        const up = good.map((i) => `${n2(sx.f(x.values[i]))},${n2(sy.f(y.values[i] + (st.errDir === 'minus' ? 0 : e(i))))}`);
        const dn = good.map((i) => `${n2(sx.f(x.values[i]))},${n2(lowOf(i))}`).reverse();
        parts.push(<polygon key={`b${k}`} points={[...up, ...dn].join(' ')} fill={errC} fillOpacity={st.fillOpacity} stroke="none" />);
        if (st.errBandEdge > 0) parts.push(<path key={`be${k}`} d={`M${up.join('L')}M${dn.join('L')}`} fill="none" stroke={errC} strokeWidth={st.errBandEdge} strokeDasharray={dashArray(st.errDash, st.errBandEdge)} strokeOpacity={st.errOpacity} />);
      });
    return <g>{parts}</g>;
  }
  // a rug: every value a tick from the frame's edge inward (whatever the other coordinate)
  if (st.rug) {
    const len = st.rugLength && st.rugLength > 0 ? st.rugLength : 4;
    const vs = st.rug === 'x' ? x.values : y.values;
    const s = st.rug === 'x' ? sx : sy;
    let path = '';
    for (let i = 0; i < vs.length; i++) {
      if (!validFor(s.spec, vs[i]) || c.mask?.[i]) continue;
      const p = s.f(vs[i]);
      if (st.rug === 'x' ? p < frame.x - 0.01 || p > frame.x + frame.w + 0.01 : p < frame.y - 0.01 || p > frame.y + frame.h + 0.01) continue;
      path += st.rug === 'x' ? `M${n2(p)},${n2(frame.y + frame.h)}v${n2(-len)}` : `M${n2(frame.x)},${n2(p)}h${n2(len)}`;
    }
    if (path) parts.push(<path key="rug" d={path} stroke={st.color} strokeWidth={Math.max(0.3, st.lineWidth)} strokeOpacity={st.lineOpacity} fill="none" />);
  }
  if (st.drop !== 'none')
    parts.push(
      <path
        key="drop"
        d={idx
          .map((i) => {
            const [px, py] = [sx.f(x.values[i]), sy.f(y.values[i])];
            return st.drop === 'vertical' ? `M${n2(px)},${n2(py)}V${n2(frame.y + frame.h)}` : `M${n2(frame.x)},${n2(py)}H${n2(px)}`;
          })
          .join('')}
        stroke={st.color}
        strokeWidth={Math.max(0.3, st.lineWidth * 0.6)}
        strokeOpacity={0.6}
        fill="none"
      />,
    );
  // error bars: Y (+ and − may differ), X with its own look or as Y; every N-th point; stopped at the symbol
  let errEl: ReactNode = null;
  if ((yErr && st.errStyle === 'bars') || xErr) {
    const ex = st.errX.same ? { width: st.errWidth, cap: st.errCap, color: errC, dash: st.errDash, dir: st.errDir } : { ...st.errX, color: st.errX.color || st.color };
    const every = Math.max(1, Math.floor(st.errEvery) || 1);
    // half the symbol, where a bar stops when it is asked to
    const r = st.errGap && hasSymbols(c) ? st.symbolSize / 2 + st.symbolEdge / 2 : 0;
    const yb: string[] = [];
    const yc: string[] = [];
    const xb: string[] = [];
    const xc: string[] = [];
    const cy = st.errCap / 2;
    const cx = ex.cap / 2;
    idx.forEach((i, k) => {
      if (k % every) return;
      const [px, py] = [sx.f(x.values[i]), sy.f(y.values[i])];
      const up = yErr && st.errStyle === 'bars' ? Math.abs(yErr.values[i]) : NaN;
      const down = yErr && st.errStyle === 'bars' ? Math.abs((c.series.yErrLo ?? yErr).values[i]) : NaN;
      if (Number.isFinite(up) && st.errDir !== 'minus' && up > 0) {
        const hi = sy.f(y.values[i] + up);
        if (py - hi > r) yb.push(`M${n2(px)},${n2(py - r)}V${n2(hi)}`);
        if (cy > 0) yc.push(`M${n2(px - cy)},${n2(hi)}h${n2(2 * cy)}`);
      }
      if (Number.isFinite(down) && st.errDir !== 'plus' && down > 0) {
        const loV = y.values[i] - down;
        const lo = validFor(sy.spec, loV) ? sy.f(loV) : frame.y + frame.h + 2;
        if (lo - py > r) yb.push(`M${n2(px)},${n2(py + r)}V${n2(lo)}`);
        if (cy > 0 && validFor(sy.spec, loV)) yc.push(`M${n2(px - cy)},${n2(lo)}h${n2(2 * cy)}`);
      }
      const e = xErr ? Math.abs(xErr.values[i]) : NaN;
      if (Number.isFinite(e) && e > 0) {
        if (ex.dir !== 'minus') {
          const rr = sx.f(x.values[i] + e);
          if (rr - px > r) xb.push(`M${n2(px + r)},${n2(py)}H${n2(rr)}`);
          if (cx > 0) xc.push(`M${n2(rr)},${n2(py - cx)}v${n2(2 * cx)}`);
        }
        if (ex.dir !== 'plus') {
          const lV = x.values[i] - e;
          const l = validFor(sx.spec, lV) ? sx.f(lV) : frame.x - 2;
          if (px - l > r) xb.push(`M${n2(px - r)},${n2(py)}H${n2(l)}`);
          if (cx > 0 && validFor(sx.spec, lV)) xc.push(`M${n2(l)},${n2(py - cx)}v${n2(2 * cx)}`);
        }
      }
    });
    const capW = Number.isFinite(st.errCapWidth) ? st.errCapWidth : st.errWidth;
    errEl = (
      <g key="err" fill="none" strokeOpacity={st.errOpacity}>
        {yb.length > 0 && <path d={yb.join('')} stroke={errC} strokeWidth={st.errWidth} strokeDasharray={dashArray(st.errDash, st.errWidth)} />}
        {yc.length > 0 && <path d={yc.join('')} stroke={errC} strokeWidth={capW} />}
        {xb.length > 0 && <path d={xb.join('')} stroke={ex.color} strokeWidth={ex.width} strokeDasharray={dashArray(ex.dash, ex.width)} />}
        {xc.length > 0 && <path d={xc.join('')} stroke={ex.color} strokeWidth={st.errX.same ? capW : ex.width} />}
      </g>
    );
    if (!st.errAbove) parts.push(errEl);
  }
  // the symbols' sizes (from the data, or one size), on every N-th point
  const every = Math.max(1, Math.floor(st.every) || 1);
  const sRange = c.sizeRange ?? [0, 1];
  const sizeAt = (i: number) => (c.sizeValues ? scaledSize(c.sizeValues[i], sRange, st.sizeMin, st.sizeMax, { log: st.sizeLog, reverse: st.sizeReverse, area: st.sizeArea }) : st.symbolSize);
  const lineParts: ReactNode[] = [];
  if (hasLine(c)) {
    const common = { fill: 'none', strokeWidth: st.lineWidth, strokeDasharray: dashArray(st.dash, st.lineWidth), strokeLinejoin: st.lineJoin ?? ('round' as const), strokeLinecap: st.lineCap ?? (st.dash === 'dot' ? ('round' as const) : ('butt' as const)), strokeOpacity: st.lineOpacity };
    // a halo: the same line, wider, in the halo's colour, under it
    if (st.halo && st.halo > 0)
      runs.forEach((r, k) => {
        const px = r.map((i) => sx.f(x.values[i]));
        const py = r.map((i) => sy.f(y.values[i]));
        lineParts.push(<path key={`h${k}`} d={linePath(c, px, py)} fill="none" stroke={st.haloColor || '#ffffff'} strokeWidth={st.lineWidth + 2 * (st.halo ?? 0)} strokeLinejoin={st.lineJoin ?? 'round'} strokeLinecap="round" />);
      });
    if (c.widthValues) {
      // the width from the data: one segment per pair of points, as wide as its two points on average (and in the colour
      // of its first point), the segments of one colour and width in one path
      const wv = c.widthValues;
      const wr = c.widthRange ?? [0, 1];
      const wAt = (i: number) => scaledSize(wv[i], wr, st.widthMin ?? 0.5, st.widthMax ?? 3);
      const byKey = new Map<string, { col: string; w: number; d: string }>();
      for (const r of runs)
        r.slice(1).forEach((i, k) => {
          const j = r[k];
          const w = Math.round(((wAt(i) + wAt(j)) / 2) * 20) / 20;
          if (!(w > 0)) return;
          const col = lineColored && colors ? colors[j] : st.color;
          const q = `${col}|${w}`;
          let p = byKey.get(q);
          if (!p) byKey.set(q, (p = { col, w, d: '' }));
          p.d += `M${n2(sx.f(x.values[j]))},${n2(sy.f(y.values[j]))}L${n2(sx.f(x.values[i]))},${n2(sy.f(y.values[i]))}`;
        });
      lineParts.push(
        <g key="line" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeOpacity={st.lineOpacity}>
          {[...byKey].map(([q, p]) => (
            <path key={q} d={p.d} stroke={p.col} strokeWidth={p.w} strokeDasharray={dashArray(st.dash, p.w)} />
          ))}
        </g>,
      );
    } else if (lineColored && colors)
      // one segment per pair of points, in the colour of its first point
    {
      const byColor = new Map<string, string>();
      for (const r of runs)
        r.slice(1).forEach((i, k) => {
          const j = r[k];
          byColor.set(colors[j], (byColor.get(colors[j]) ?? '') + `M${n2(sx.f(x.values[j]))},${n2(sy.f(y.values[j]))}L${n2(sx.f(x.values[i]))},${n2(sy.f(y.values[i]))}`);
        });
      lineParts.push(
        <g key="line" {...common} strokeLinecap="round">
          {[...byColor].map(([col, d]) => (
            <path key={col} d={d} stroke={col} />
          ))}
        </g>,
      );
    }
    else
      runs.forEach((r, k) => {
        const px = r.map((i) => sx.f(x.values[i]));
        const py = r.map((i) => sy.f(y.values[i]));
        lineParts.push(<path key={`l${k}`} d={linePath(c, px, py)} stroke={st.color} {...common} />);
      });
    // heads at the start of the first piece and the end of the last
    const first = runs.find((r) => r.length > 1);
    const last = [...runs].reverse().find((r) => r.length > 1);
    const P = (i: number): [number, number] => [sx.f(x.values[i]), sy.f(y.values[i])];
    const size = st.arrowSize && st.arrowSize > 0 ? st.arrowSize : 3 + 2 * st.lineWidth;
    if (first && st.arrowStart && st.arrowStart !== 'none') {
      const [a, b] = [P(first[0]), P(first[1])];
      lineParts.push(<g key="as">{head(st.arrowStart, a[0], a[1], Math.atan2(a[1] - b[1], a[0] - b[0]), size, st.color, st.lineWidth)}</g>);
    }
    if (last && st.arrowEnd && st.arrowEnd !== 'none') {
      const [a, b] = [P(last[last.length - 1]), P(last[last.length - 2])];
      lineParts.push(<g key="ae">{head(st.arrowEnd, a[0], a[1], Math.atan2(a[1] - b[1], a[0] - b[0]), size, st.color, st.lineWidth)}</g>);
    }
  }
  // line + symbols: the line stopped a gap before every symbol (a mask with a hole around each), under or over them
  let lineEl: ReactNode = null;
  if (lineParts.length) {
    const gap = hasSymbols(c) ? Math.max(0, st.symbolGap ?? 0) : 0;
    let holes = '';
    if (gap > 0)
      for (let k = 0; k < idx.length; k += every) {
        const i = idx[k];
        const size = sizeAt(i);
        const px = sx.f(x.values[i]);
        const py = sy.f(y.values[i]);
        if (size > 0 && Number.isFinite(px) && Number.isFinite(py)) holes += symbolPath('circle', size + st.symbolEdge + 2 * gap, px, py);
      }
    const mid = `${gid}-gap-${c.key.replace(/[^\w-]/g, '_')}`;
    lineEl = holes ? (
      <g key="lineg">
        <defs>
          <mask id={mid} maskUnits="userSpaceOnUse" x={-1e5} y={-1e5} width={2e5} height={2e5}>
            <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="#ffffff" />
            <path d={holes} fill="#000000" />
          </mask>
        </defs>
        <g mask={`url(#${mid})`}>{lineParts}</g>
      </g>
    ) : (
      <g key="lineg">{lineParts}</g>
    );
    if (!st.lineOver) parts.push(lineEl);
  }
  if (hasSymbols(c)) {
    // the symbols of one colour in one path (and their centre dots in another); a symbol exactly over another of the
    // same colour and size adds nothing to the picture: one per cell of a tenth of its size (a number as the key — a
    // million points drawn fast)
    const groups = new Map<string, { d: string; dots: string; seen: Map<number, Set<number>> }>();
    for (let k = 0; k < idx.length; k += every) {
      const i = idx[k];
      const col = symColored && colors ? colors[i] : st.color;
      const size = sizeAt(i);
      if (!(size > 0)) continue;
      const px = sx.f(x.values[i]);
      const py = sy.f(y.values[i]);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      let g = groups.get(col);
      if (!g) groups.set(col, (g = { d: '', dots: '', seen: new Map() }));
      const sk = Math.round(size * 100);
      let seen = g.seen.get(sk);
      if (!seen) g.seen.set(sk, (seen = new Set()));
      const q = Math.max(0.05, size * 0.1);
      const cell = Math.round(px / q) * 4194304 + Math.round(py / q);
      if (seen.has(cell)) continue;
      seen.add(cell);
      g.d += symbolPath(st.symbol, size, px, py);
      if (st.symbolFill === 'dot') g.dots += symbolPath('circle', Math.max(0.8, size * 0.24), px, py);
    }
    const open = lineOnly(st.symbol) || st.symbolFill === 'open' || st.symbolFill === 'dot';
    parts.push(
      <g key="sym" opacity={st.symbolOpacity < 1 ? st.symbolOpacity : undefined} strokeLinejoin="round" strokeWidth={lineOnly(st.symbol) ? Math.max(st.symbolEdge, 0.6) : st.symbolEdge}>
        {[...groups].map(([col, g]) => (
          <Fragment key={col}>
            <path d={g.d} fill={open ? 'none' : st.symbolFill === 'white' ? '#ffffff' : col} stroke={st.edgeColor || col} />
            {g.dots && <path d={g.dots} fill={st.edgeColor || col} stroke="none" />}
          </Fragment>
        ))}
      </g>,
    );
  }
  if (lineEl && st.lineOver) parts.push(lineEl);
  if (errEl && st.errAbove) parts.push(errEl);
  if (faded.length) {
    const size = hasSymbols(c) ? st.symbolSize : Math.max(2.5, st.lineWidth * 3);
    const shape = hasSymbols(c) ? st.symbol : 'circle';
    parts.push(<path key="masked" d={faded.map((i) => symbolPath(shape, size, sx.f(x.values[i]), sy.f(y.values[i]))).join('')} fill="#b4b4b4" fillOpacity={0.55} stroke="#8c8c8c" strokeWidth={0.5} />);
  }
  if (st.labels !== 'none') {
    const t = resolveText(st.labelText, { ...defaults, size: defaults.size * 0.85 });
    const off = Math.max(st.symbolSize / 2, 1) + 1.5;
    parts.push(
      <g key="lab">
        {idx.map((i) => {
          const v = st.labels === 'x' ? x.values[i] : st.labels === 'y' ? y.values[i] : NaN;
          const lv = c.labelValues;
          const text = st.labels === 'column' ? (lv ? (lv.text?.[i] ?? (Number.isFinite(lv.values[i]) ? String(+lv.values[i].toPrecision(Math.max(1, st.labelDigits))) : '')) : '') : Number.isFinite(v) ? String(+v.toPrecision(Math.max(1, st.labelDigits))).replace('-', '−') : '';
          if (!text) return null;
          const [px, py] = [sx.f(x.values[i]), sy.f(y.values[i])];
          const p = st.labelPos;
          const end = p === 'left' || p === 'aboveLeft' || p === 'belowLeft';
          const start = p === 'aboveRight' || p === 'belowRight';
          const up = p === 'above' || p === 'aboveLeft' || p === 'aboveRight';
          const down = p === 'below' || p === 'belowLeft' || p === 'belowRight';
          return <RichText key={i} text={text} st={t} x={p === 'left' ? px - off : p === 'right' ? px + off : end ? px - 1 : start ? px + 1 : px} y={up ? py - off : down ? py + off : py} anchor={end ? 'end' : p === 'right' || start ? 'start' : 'middle'} valign={up ? 'bottom' : down ? 'top' : 'middle'} num />;
        })}
      </g>,
    );
  }
  return <g>{parts}</g>;
}

// ---- legend ----

// place: its top-left corner (pt) when it is set apart from its x, y (a legend outside the frame, past the axis)
function LegendBox(props: { lg: LegendSpec; box: Box; defaults: TextDefaults; place?: { x: number; y: number } }) {
  const { lg, box } = props;
  return (
    <Draggable info={dragOf(lg.key, lg.owner, (dx, dy) => ({ x: r1(lg.x + (dx / box.w) * 100), y: r1(lg.y + (dy / box.h) * 100), anchor: lg.anchor, ...(lg.auto ? { auto: false } : {}) }))}>
      <LegendDraw {...props} />
    </Draggable>
  );
}
function LegendDraw({ lg, box, defaults, place }: { lg: LegendSpec; box: Box; defaults: TextDefaults; place?: { x: number; y: number } }) {
  if (!lg.curves.length && !lg.title) return null;
  const L = legendLayout(lg, defaults);
  const at = place ?? boxAt(lg.anchor, box.x + (lg.x / 100) * box.w, box.y + (lg.y / 100) * box.h, L.w, L.h);
  const rx = Math.min(lg.radius ?? (lg.frame === 'round' ? 4 : 0), L.h / 2, L.w / 2);
  const bg = lg.background || (lg.frame === 'shadow' ? '#ffffff' : '');
  return (
    <g>
      {lg.frame === 'shadow' && <rect x={n2(at.x + 1.5)} y={n2(at.y + 1.5)} width={n2(L.w)} height={n2(L.h)} rx={rx || undefined} fill="#000000" fillOpacity={0.35} />}
      {(bg || lg.frame !== 'none') && <rect x={n2(at.x)} y={n2(at.y)} width={n2(L.w)} height={n2(L.h)} rx={rx || undefined} fill={bg || 'none'} fillOpacity={bg ? lg.bgOpacity : undefined} stroke={lg.frame === 'none' ? 'none' : lg.frameColor} strokeWidth={lg.frameWidth} strokeDasharray={lg.frame === 'none' ? undefined : dashArray(lg.frameDash ?? 'solid', lg.frameWidth)} strokeOpacity={lg.frameOpacity ?? undefined} />}
      {lg.title && <RichText x={at.x + L.w / 2} y={at.y + lg.padding} text={lg.title} st={L.titleT} anchor="middle" valign="top" />}
      {L.curves.map((c, k) => {
        const { col, row } = L.cell(k);
        const x0 = at.x + lg.padding + L.colW.slice(0, col).reduce((a, b) => a + b, 0) + col * L.gap * 1.5;
        const cy = at.y + lg.padding + L.titleH + L.rowY[row] + L.t.size / 2;
        // its text: its first line beside the mark, the others under it
        const ty = cy + L.extra[k];
        const st = c.style;
        const color = legendColor(c);
        if (c.groupSpan && c.group?.color === 'map') {
          const stops = stopsOf(st.cmap, st.cmapColors);
          const h = L.t.size * 0.6;
          const m = 8;
          return (
            <g key={`${c.key}-${k}`}>
              {Array.from({ length: m }, (_, j) => (
                <rect key={j} x={n2(x0 + (j * lg.lineLen) / m)} y={n2(cy - h / 2)} width={n2(lg.lineLen / m + 0.05)} height={n2(h)} fill={mapColor(stops, st.cmapReverse ? 1 - j / (m - 1) : j / (m - 1))} />
              ))}
              <RichText x={x0 + lg.lineLen + L.gap} y={ty} text={c.label} st={L.t} valign="middle" />
            </g>
          );
        }
        if (c.bars || c.boxes) {
          const lk = { ...BAR_LOOK_DEFAULTS, ...(c.bars?.style ?? c.boxes?.look) };
          const pid = `lg-${lg.key}-${k}`.replace(/[^\w-]/g, '_');
          const sw = { x: n2(x0), y: n2(cy - L.t.size * 0.35), width: n2(lg.lineLen), height: n2(L.t.size * 0.7), rx: lk.radius > 0 ? n2(Math.min(lk.radius, L.t.size * 0.35)) : undefined };
          const fill = c.bars?.colors?.[0] || c.boxes?.items[0]?.fill || st.fillColor || color;
          const gp = c.bars?.look === 'step' ? null : gradPair(fill, c.bars?.colors2?.[0] || c.boxes?.items[0]?.fill2, lk);
          return (
            <g key={`${c.key}-${k}`}>
              {(lk.hatch !== 'none' || gp) && (
                <defs>
                  {lk.hatch !== 'none' && <HatchPattern id={pid} h={lk.hatch} s={Math.max(1, lk.hatchSpacing)} color={lk.hatchColor || st.edgeColor || color} width={lk.hatchWidth} look={lk.hatchLook} />}
                  {gp && <GradDefs keys={[gp.join('|')]} id={() => `${pid}-g`} hor={false} />}
                </defs>
              )}
              <rect {...sw} fill={c.bars?.look === 'step' ? 'none' : gp ? `url(#${pid}-g)` : fill} fillOpacity={c.bars?.look === 'step' ? undefined : st.fillOpacity} stroke={c.bars?.look === 'step' ? color : st.lineWidth > 0 ? st.edgeColor || color : 'none'} strokeWidth={c.bars?.look === 'step' ? Math.max(st.lineWidth, 0.5) : st.lineWidth} strokeDasharray={dashArray(lk.edgeDash, Math.max(st.lineWidth, 0.5))} />
              {lk.hatch !== 'none' && c.bars?.look !== 'step' && <rect {...sw} fill={`url(#${pid})`} />}
              <RichText x={x0 + lg.lineLen + L.gap} y={ty} text={c.label} st={L.t} valign="middle" />
            </g>
          );
        }
        return (
          <g key={`${c.key}-${k}`}>
            {(st.fill !== 'none' || (st.errStyle === 'band' && c.series.yErr)) && <rect x={n2(x0)} y={n2(cy - L.t.size * 0.35)} width={n2(lg.lineLen)} height={n2(L.t.size * 0.7)} fill={st.fill !== 'none' ? st.fillColor || color : st.errColor || color} fillOpacity={st.fillOpacity} />}
            {hasLine(c) && <line x1={n2(x0)} x2={n2(x0 + lg.lineLen)} y1={n2(cy)} y2={n2(cy)} stroke={color} strokeWidth={c.widthValues ? ((st.widthMin ?? 0.5) + (st.widthMax ?? 3)) / 2 : st.lineWidth} strokeOpacity={st.lineOpacity} strokeDasharray={dashArray(st.dash, st.lineWidth)} />}
            {hasSymbols(c) && <Mark shape={st.symbol} size={c.sizeValues ? (st.sizeMin + st.sizeMax) / 2 : st.symbolSize} x={x0 + lg.lineLen / 2} y={cy} color={color} edge={st.edgeColor || color} fill={st.symbolFill} width={st.symbolEdge} />}
            <RichText x={x0 + lg.lineLen + L.gap} y={ty} text={c.label} st={L.t} valign="middle" />
          </g>
        );
      })}
    </g>
  );
}

// ---- annotations ----
type Mapper = { x: (v: number) => number; y: (v: number) => number; ix: (p: number) => number; iy: (p: number) => number; box: Box };

function head(kind: ArrowHead, x: number, y: number, ang: number, size: number, color: string, width: number): ReactNode {
  if (kind === 'none') return null;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (u: number, v: number) => `${n2(x + u * c - v * s)},${n2(y + u * s + v * c)}`;
  const w = size * 0.42;
  switch (kind) {
    case 'triangle':
      return <polygon points={`${P(0, 0)} ${P(-size, w)} ${P(-size, -w)}`} fill={color} stroke="none" />;
    case 'stealth':
      return <polygon points={`${P(0, 0)} ${P(-size, w)} ${P(-size * 0.65, 0)} ${P(-size, -w)}`} fill={color} stroke="none" />;
    case 'open':
      return <polyline points={`${P(-size, w)} ${P(0, 0)} ${P(-size, -w)}`} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="miter" />;
    case 'bar':
      return <line x1={n2(x - w * s)} y1={n2(y + w * c)} x2={n2(x + w * s)} y2={n2(y - w * c)} stroke={color} strokeWidth={width} />;
    case 'circle':
      return <circle cx={n2(x)} cy={n2(y)} r={n2(size * 0.3)} fill={color} />;
    case 'diamond':
      return <polygon points={`${P(0, 0)} ${P(-size / 2, w)} ${P(-size, 0)} ${P(-size / 2, -w)}`} fill={color} stroke="none" />;
    case 'square': {
      const h = size * 0.3;
      return <polygon points={`${P(h, h)} ${P(-h, h)} ${P(-h, -h)} ${P(h, -h)}`} fill={color} stroke="none" />;
    }
    case 'half':
      return <polygon points={`${P(0, 0)} ${P(-size, -w * 1.2)} ${P(-size * 0.8, 0)}`} fill={color} stroke="none" />;
  }
}
// how far the line stops before a head, so it does not show through the tip
const inset = (k: ArrowHead, size: number) => (k === 'triangle' ? size * 0.9 : k === 'stealth' ? size * 0.6 : k === 'diamond' ? size * 0.95 : 0);

// a line's own dashes: "dash gap dash gap …" in pt (none when it is not such a list)
const ownDashes = (p: string | undefined): string | undefined => {
  const v = (p ?? '').split(/[\s,;]+/).filter(Boolean).map(Number);
  return v.length && v.every((x) => Number.isFinite(x) && x >= 0) && v.some((x) => x > 0) ? v.map(n2).join(' ') : undefined;
};
const strokeOf = (s: ShapeSpec) => ({ stroke: s.color, strokeWidth: s.width, strokeDasharray: ownDashes(s.dashPattern) ?? dashArray(s.dash, s.width), strokeOpacity: s.opacity, strokeLinecap: s.cap ?? ('butt' as const), strokeLinejoin: s.join ?? ('miter' as const), strokeMiterlimit: s.miter && s.miter >= 1 ? s.miter : undefined });
// the shapes with an inside (filled): their shadow is a copy of the shape; the others' a soft one (a filter)
const isClosed = (s: ShapeSpec) => s.kind === 'rect' || s.kind === 'ellipse' || s.kind === 'star' || s.kind === 'regular' || (s.kind === 'arc' && !!s.sector) || (s.kind === 'polygon' && s.closed !== false) || s.kind === 'callout' || s.kind === 'xband' || s.kind === 'yband';
const softShadow = (s: ShapeSpec) => !!s.shadow && ((s.shadowBlur ?? 0) > 0 || !isClosed(s));
// A shape's soft shadow (its outline blurred, moved, in its colour) and its blur: SVG filters over the region `box` (pt).
function Effects({ id, box, blur, shadow, children }: { id: string; box: Box; blur?: number; shadow?: { dx: number; dy: number; blur: number; color: string; opacity: number } | null; children: ReactNode }) {
  const b = blur && blur > 0 ? blur : 0;
  if (!b && !shadow) return <>{children}</>;
  const m = Math.max(box.w, box.h) * 0.5 + 20;
  const region = { x: n2(box.x - m), y: n2(box.y - m), width: n2(box.w + 2 * m), height: n2(box.h + 2 * m), filterUnits: 'userSpaceOnUse' as const };
  const inner = shadow ? (
    <g filter={`url(#${id}-sh)`}>
      <defs>
        <filter id={`${id}-sh`} {...region} colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation={n2(Math.max(0, shadow.blur) / 2)} result="b" />
          <feOffset in="b" dx={n2(shadow.dx)} dy={n2(shadow.dy)} result="o" />
          <feFlood floodColor={shadow.color} floodOpacity={shadow.opacity} />
          <feComposite in2="o" operator="in" result="s" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {children}
    </g>
  ) : (
    children
  );
  if (!b) return inner;
  return (
    <g filter={`url(#${id}-bl)`}>
      <defs>
        <filter id={`${id}-bl`} {...region}>
          <feGaussianBlur stdDeviation={n2(b / 2)} />
        </filter>
      </defs>
      {inner}
    </g>
  );
}
const shadowOf = (s: ShapeSpec) => (softShadow(s) ? { dx: s.shadowX ?? 1.5, dy: s.shadowY ?? 1.5, blur: s.shadowBlur ?? 0, color: s.shadowColor || '#000000', opacity: s.shadowOpacity ?? 0.3 } : null);
// A closed shape drawn by `make` (an element given its paint): its shadow, its fill (a colour or a gradient), its hatching,
// its outline — turned by `transform`.
// box: the shape's box (pt, before it is turned) its gradient is placed in; gradTurn: the gradient turned with a shape
// whose turn is in its outline
function ClosedShape({ s, id, make, transform, color, outline = true, box, gradTurn }: { s: ShapeSpec; id: string; make: (p: Record<string, unknown>) => ReactNode; transform?: string; color?: string; outline?: boolean; box?: Box | null; gradTurn?: string }) {
  const fillC = s.fill || color || '';
  const grad = !!fillC && !!s.grad && s.grad !== 'none';
  const hatch = !!s.hatch && s.hatch !== 'none';
  const g2 = s.fill2 || '#ffffff';
  const stops = (
    <>
      <stop offset="0" stopColor={fillC} />
      <stop offset="1" stopColor={g2} stopOpacity={s.fill2Opacity != null && s.fill2Opacity < 1 ? s.fill2Opacity : undefined} />
    </>
  );
  const spread = s.gradSpread && s.gradSpread !== 'pad' ? s.gradSpread : undefined;
  return (
    <g transform={transform}>
      {(grad || hatch) && (
        <defs>
          {grad &&
            (box && box.w > 0 && box.h > 0 ? (
              s.grad === 'radial' ? (
                <radialGradient id={`${id}-g`} {...gradAttrs(s, box, gradTurn)}>
                  {stops}
                </radialGradient>
              ) : (
                <linearGradient id={`${id}-g`} {...gradAttrs(s, box, gradTurn)}>
                  {stops}
                </linearGradient>
              )
            ) : s.grad === 'radial' ? (
              <radialGradient id={`${id}-g`} cx="0.5" cy="0.5" r="0.5" spreadMethod={spread}>
                {stops}
              </radialGradient>
            ) : (
              <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="0" gradientTransform={`rotate(${n2(s.gradAngle ?? 90)} 0.5 0.5)`} spreadMethod={spread}>
                {stops}
              </linearGradient>
            ))}
          {hatch && <HatchPattern id={`${id}-h`} h={s.hatch!} s={4} color={s.hatchColor || s.color} width={0.6} look={s.hatchLook} />}
        </defs>
      )}
      {s.shadow && !softShadow(s) && <Fragment key="sh">{make({ fill: s.shadowColor || '#000000', fillOpacity: s.shadowOpacity ?? 0.3, stroke: 'none', transform: `translate(${n2(s.shadowX ?? 1.5)} ${n2(s.shadowY ?? 1.5)})` })}</Fragment>}
      {fillC && <Fragment key="f">{make({ fill: grad ? `url(#${id}-g)` : fillC, fillOpacity: s.fillOpacity, stroke: 'none' })}</Fragment>}
      {hatch && <Fragment key="h">{make({ fill: `url(#${id}-h)`, stroke: 'none' })}</Fragment>}
      {outline && s.width > 0 && <Fragment key="o">{make({ fill: 'none', ...strokeOf(s) })}</Fragment>}
    </g>
  );
}
const polyPoints = (text: string) =>
  text
    .split(';')
    .map((p) => p.trim().split(/[\s,]+/).map(Number))
    .filter((p) => p.length >= 2 && p.every(Number.isFinite));
// the length of a scale bar: its own, or a nice one about a fifth of the frame
function scaleLength(s: ShapeSpec, m: Mapper): number {
  if (Number.isFinite(s.len) && s.len! > 0) return s.len!;
  const raw = s.vertical ? Math.abs(m.iy(m.box.y) - m.iy(m.box.y + m.box.h * 0.2)) : Math.abs(m.ix(m.box.x + m.box.w * 0.2) - m.ix(m.box.x));
  return niceLength(raw);
}
// the far end of a scale bar from its start (pt)
function scaleEnd(s: ShapeSpec, m: Mapper, x: number, y: number): Pt {
  const len = scaleLength(s, m);
  if (s.vertical) {
    const e = m.y(m.iy(y) + len);
    return [x, Number.isFinite(e) ? e : y];
  }
  const e = m.x(m.ix(x) + len);
  return [Number.isFinite(e) ? e : x, y];
}
// the box of a callout around its text (centred on (x, y))
function calloutBox(s: ShapeSpec, t: ResolvedText, x: number, y: number) {
  const mt = richMetrics(s.text || ' ', t);
  const pad = s.pad ?? 2;
  const w = mt.width + 2 * pad;
  const h = mt.lines * mt.lineHeight + 2 * pad - (mt.lineHeight - t.size) * 0.6;
  return { x: x - w / 2, y: y - h / 2, w, h, pad };
}

// A line or an arrow: its route (straight, bent, through bends, an elbow), its body (one line, two, tapered, a wave, a
// zigzag, an equilibrium ⇌, a retrosynthetic ⇒), its heads, crossed out or not, its texts above and below it.
function ArrowView({ s, p1, p2, bends, stroke, defaults }: { s: ShapeSpec; p1: Pt; p2: Pt; bends: Pt[]; stroke: ReturnType<typeof strokeOf>; defaults: TextDefaults }) {
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
  const elbow = s.route && s.route !== 'line' ? s.route : null;
  const body = s.body ?? 'single';
  const size = s.headSize;
  const [ia, ib] = [Math.min(len / 2, inset(s.head1, size)), Math.min(len / 2, inset(s.head2, size))];
  // the middle line, as points
  const mid: Pt[] = elbow ? roundedCorners(elbowCorners(p1, p2, elbow, s.elbowAt ?? 0.5), s.radius || 0) : bends.length ? throughPoints([p1, ...bends, p2]) : bentPoints(p1, p2, s.curve ?? 0);
  const ends = endAngles(mid);
  const sw = { ...stroke, strokeOpacity: undefined };
  const gap = s.gap ?? Math.max(2, size * 0.5);
  const line = (pts: Pt[], k: string) => <path key={k} d={pointsD(pts)} fill="none" {...sw} />;
  let lines: ReactNode;
  let heads = true;
  // a harpoon's barb at the tip of `pts` (its end), on its left (the outer side of either line of ⇌)
  const barb = (pts: Pt[], k: string) => {
    const { u } = pointAlong(pts, 1);
    const tip = pts[pts.length - 1];
    const side: Pt = [u[1], -u[0]];
    return <path key={k} d={`M${n2(tip[0])},${n2(tip[1])}L${n2(tip[0] - u[0] * size + side[0] * size * 0.45)},${n2(tip[1] - u[1] * size + side[1] * size * 0.45)}`} fill="none" {...sw} strokeLinecap="round" />;
  };
  if (body === 'double') {
    const t = trimLine(mid, ia, ib);
    lines = [line(offsetLine(t, gap / 2), 'a'), line(offsetLine(t, -gap / 2), 'b')];
  } else if (body === 'tapered') {
    lines = <path d={pointsD(taperOutline(trimLine(mid, ia, ib), Math.max(0, s.width2 ?? 0), s.width), true)} fill={s.color} stroke="none" />;
  } else if (body === 'wavy' || body === 'zigzag') {
    lines = line(waveLine(trimLine(mid, ia, ib), s.amp ?? 2, s.wave ?? 6, body === 'zigzag'), 'w');
  } else if (body === 'equilibrium' || body === 'eqRight' || body === 'eqLeft') {
    // two harpoons: forward on the upper line, back on the lower; the one of the side favoured longer
    heads = false;
    const L = lineLength(mid);
    const short = (pts: Pt[]) => trimLine(pts, L * 0.2, L * 0.2);
    let top = offsetLine(mid, gap / 2);
    let bottom = offsetLine(mid, -gap / 2);
    if (body === 'eqLeft') top = short(top);
    if (body === 'eqRight') bottom = short(bottom);
    const back = bottom.slice().reverse();
    lines = [line(top, 't'), barb(top, 'tb'), line(back, 'b'), barb(back, 'bb')];
  } else if (body === 'retro') {
    // ⇒: two lines up to an open head that spans them
    heads = false;
    const w = gap / 2 + size * 0.45;
    const t = trimLine(mid, 0, (size * (gap / 2)) / w + s.width * 0.5);
    const { u } = pointAlong(mid, 1);
    const tip = mid[mid.length - 1];
    const nn: Pt = [u[1], -u[0]];
    const arm = (k: number) => `${n2(tip[0] - u[0] * size + nn[0] * w * k)},${n2(tip[1] - u[1] * size + nn[1] * w * k)}`;
    lines = [line(offsetLine(t, gap / 2), 'a'), line(offsetLine(t, -gap / 2), 'b'), <path key="h" d={`M${arm(1)}L${n2(tip[0])},${n2(tip[1])}L${arm(-1)}`} fill="none" {...sw} strokeLinejoin="miter" />];
  } else if (!elbow) {
    const b = bends.length ? throughLine([p1, ...bends, p2], ia, ib) : bentLine(p1, p2, s.curve ?? 0, ia, ib);
    lines = <path d={b.d} fill="none" {...sw} />;
  } else lines = line(trimLine(mid, ia, ib), 's');
  // ✕ in its middle: the reaction does not happen
  const cross = (() => {
    if (!s.cross) return null;
    const { p, u } = pointAlong(mid, 0.5);
    const r = Math.max(size, gap) * 0.75;
    const c = Math.SQRT1_2;
    const d1: Pt = [(u[0] - u[1]) * c * r, (u[1] + u[0]) * c * r];
    const d2: Pt = [(u[0] + u[1]) * c * r, (u[1] - u[0]) * c * r];
    return <path d={`M${n2(p[0] - d1[0])},${n2(p[1] - d1[1])}L${n2(p[0] + d1[0])},${n2(p[1] + d1[1])}M${n2(p[0] - d2[0])},${n2(p[1] - d2[1])}L${n2(p[0] + d2[0])},${n2(p[1] + d2[1])}`} fill="none" {...sw} strokeDasharray={undefined} />;
  })();
  // its texts: above (text) and below (text2) it, at labelAt of the way
  const labels = (() => {
    if (!s.text && !s.text2) return null;
    const t = resolveText(s.textStyle, defaults);
    const { p, u } = pointAlong(mid, s.labelAt ?? 0.5);
    const up = aboveOf(u);
    const room = body === 'double' || body === 'retro' || body.startsWith('eq') ? gap / 2 + (body === 'retro' ? 0 : size * 0.45) : body === 'wavy' || body === 'zigzag' ? (s.amp ?? 2) : body === 'tapered' ? Math.max(s.width, s.width2 ?? 0) / 2 : s.width / 2;
    const place = (text: string, side: Pt, k: string) => {
      const tp = bracketTextPlace([p[0] - u[0], p[1] - u[1]], [p[0] + u[0], p[1] + u[1]], [-side[0], -side[1]], room, s.textGap ?? 1.5, s.textDir ?? 'along', s.textAngle);
      return (
        <g key={k} transform={tp.rotate ? `rotate(${n2(tp.rotate)} ${n2(tp.x)} ${n2(tp.y)})` : undefined}>
          <RichText x={tp.x} y={tp.y} text={text} st={t} anchor={tp.anchor} valign={tp.valign} />
        </g>
      );
    };
    return (
      <>
        {s.text && place(s.text, up, 'a')}
        {s.text2 && place(s.text2, [-up[0], -up[1]], 'b')}
      </>
    );
  })();
  return (
    <g opacity={s.opacity < 1 ? s.opacity : undefined}>
      {lines}
      {heads && head(s.head1, p1[0], p1[1], ends.ang1, size, s.color, s.width)}
      {heads && head(s.head2, p2[0], p2[1], ends.ang2, size, s.color, s.width)}
      {cross}
      {labels}
    </g>
  );
}

// The box a closed shape's gradient is placed in (pt, before the shape is turned) and the point it turns about
function gradFrame(s: ShapeSpec, m: Mapper): { box: Box; c: Pt } | null {
  const X = (v: number) => (s.coords === 'data' ? m.x(v) : m.box.x + (v / 100) * m.box.w);
  const Y = (v: number) => (s.coords === 'data' ? m.y(v) : m.box.y + (v / 100) * m.box.h);
  const [x1, y1, x2, y2] = [X(s.x1), Y(s.y1), X(s.x2), Y(s.y2)];
  const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  const mid = (b: Box): Pt => [b.x + b.w / 2, b.y + b.h / 2];
  switch (s.kind) {
    case 'rect':
    case 'ellipse':
    case 'star':
    case 'regular':
    case 'arc':
      return { box, c: mid(box) };
    case 'polygon': {
      const pts = polyPoints(s.points).map(([a, b]): Pt => [X(a), Y(b)]);
      if (pts.length < 3) return null;
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return { box: { x: minOf(xs), y: minOf(ys), w: maxOf(xs) - minOf(xs), h: maxOf(ys) - minOf(ys) }, c: [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length] };
    }
    case 'path': {
      const b = pathBox(mapSegs(parsePath(s.d), ([u, v]): Pt => [X(u), Y(v)]));
      return b ? { box: b, c: mid(b) } : null;
    }
    case 'xband': {
      const b = { x: box.x, y: m.box.y, w: box.w, h: m.box.h };
      return { box: b, c: mid(b) };
    }
    case 'yband': {
      const b = { x: m.box.x, y: box.y, w: m.box.w, h: box.h };
      return { box: b, c: mid(b) };
    }
    default:
      return null;
  }
}
function ShapeView({ s, m, defaults, id = 'shape' }: { s: ShapeSpec; m: Mapper; defaults: TextDefaults; id?: string }) {
  const X = (v: number) => (s.coords === 'data' ? m.x(v) : m.box.x + (v / 100) * m.box.w);
  const Y = (v: number) => (s.coords === 'data' ? m.y(v) : m.box.y + (v / 100) * m.box.h);
  const stroke = strokeOf(s);
  const [x1, y1, x2, y2] = [X(s.x1), Y(s.y1), X(s.x2), Y(s.y2)];
  const rot = (cx: number, cy: number) => (s.rotation ? `rotate(${n2(s.rotation)} ${n2(cx)} ${n2(cy)})` : undefined);
  const [cx, cy, rx, ry] = [(x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2];
  // rounded corners: its outline as a path (its turn in it), the corners rounded there
  if (s.corners && CORNERED.has(s.kind)) {
    const unit = s.coords === 'data' ? Math.abs(m.x(1) - m.x(0)) || 1 : m.box.w / 100;
    const out = shapeToPath(s, unit);
    if (out) {
      const segs = mapSegs(parsePath(out), ([u, v]): Pt => [X(u), Y(v)]);
      const lines = pathClosed(segs) ? [] : pathPolylines(segs).filter((l) => l.length > 1);
      const e1 = lines.length ? endAngles(lines[0]) : null;
      const e2 = lines.length ? endAngles(lines[lines.length - 1]) : null;
      const last = lines.length ? lines[lines.length - 1][lines[lines.length - 1].length - 1] : null;
      return (
        <g>
          <ClosedShape s={s} id={id} box={gradFrame(s, m)?.box} gradTurn={rot(cx, cy)} make={(p) => <path d={pathText(segs)} fillRule={s.evenodd ? 'evenodd' : undefined} {...p} />} />
          {e1 && head(s.head1, lines[0][0][0], lines[0][0][1], e1.ang1, s.headSize, s.color, s.width)}
          {e2 && last && head(s.head2, last[0], last[1], e2.ang2, s.headSize, s.color, s.width)}
        </g>
      );
    }
  }
  switch (s.kind) {
    case 'line':
    case 'arrow':
      return <ArrowView s={s} p1={[x1, y1]} p2={[x2, y2]} bends={bendPoints(s.bends).map(([u, v]): Pt => [X(u), Y(v)])} stroke={stroke} defaults={defaults} />;
    case 'dimension': {
      // the line between the extension lines, `offset` pt aside; its length in the units of the coordinates
      const L = Math.hypot(x2 - x1, y2 - y1) || 1;
      const u: Pt = [(x2 - x1) / L, (y2 - y1) / L];
      const n = aboveOf(u);
      const o = s.offset ?? 8;
      const sg = Math.sign(o) || 1;
      const a: Pt = [x1 + n[0] * o, y1 + n[1] * o];
      const b: Pt = [x2 + n[0] * o, y2 + n[1] * o];
      const g0 = Math.min(1.5, Math.abs(o) / 2) * sg;
      const ext = (p: Pt) => `M${n2(p[0] + n[0] * g0)},${n2(p[1] + n[1] * g0)}L${n2(p[0] + n[0] * (o + 2 * sg))},${n2(p[1] + n[1] * (o + 2 * sg))}`;
      const [ia, ib] = [Math.min(L / 2, inset(s.head1, s.headSize)), Math.min(L / 2, inset(s.head2, s.headSize))];
      const t = resolveText(s.textStyle, defaults);
      const value = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      const label = s.text || `${value.toFixed(Math.max(0, Math.min(6, s.dec ?? 1)))}${s.unit ? ` ${s.unit}` : ''}`;
      const tp = bracketTextPlace(a, b, [-n[0] * sg, -n[1] * sg], 0, s.textGap ?? 1.5, s.textDir ?? 'along', s.textAngle);
      return (
        <g opacity={s.opacity < 1 ? s.opacity : undefined}>
          <path d={`${ext([x1, y1])}${ext([x2, y2])}M${n2(a[0] + u[0] * ia)},${n2(a[1] + u[1] * ia)}L${n2(b[0] - u[0] * ib)},${n2(b[1] - u[1] * ib)}`} fill="none" {...stroke} strokeOpacity={undefined} />
          {head(s.head1, a[0], a[1], Math.atan2(-u[1], -u[0]), s.headSize, s.color, s.width)}
          {head(s.head2, b[0], b[1], Math.atan2(u[1], u[0]), s.headSize, s.color, s.width)}
          <g transform={tp.rotate ? `rotate(${n2(tp.rotate)} ${n2(tp.x)} ${n2(tp.y)})` : undefined}>
            <RichText x={tp.x} y={tp.y} text={label} st={t} anchor={tp.anchor} valign={tp.valign} num={!s.text} />
          </g>
        </g>
      );
    }
    case 'rect': {
      const [x, y, w, h] = [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
      const own = radiiOf(s.radii);
      if (own) return <ClosedShape s={s} id={id} box={{ x, y, w, h }} transform={rot(x + w / 2, y + h / 2)} make={(p) => <path d={roundedRectD(x, y, w, h, own)} {...p} />} />;
      return <ClosedShape s={s} id={id} box={{ x, y, w, h }} transform={rot(x + w / 2, y + h / 2)} make={(p) => <rect x={n2(x)} y={n2(y)} width={n2(w)} height={n2(h)} rx={s.radius || undefined} {...p} />} />;
    }
    case 'ellipse':
      return <ClosedShape s={s} id={id} box={gradFrame(s, m)?.box} transform={rot(cx, cy)} make={(p) => <ellipse cx={n2(cx)} cy={n2(cy)} rx={n2(rx)} ry={n2(ry)} {...p} />} />;
    case 'star':
    case 'regular': {
      const d = pointsPath(starPoints(cx, cy, rx, ry, s.n ?? (s.kind === 'star' ? 5 : 6), s.kind === 'star' ? Math.min(1, Math.max(0.05, s.inner ?? 0.382)) : null));
      return <ClosedShape s={s} id={id} box={gradFrame(s, m)?.box} transform={rot(cx, cy)} make={(p) => <path d={d} {...p} />} />;
    }
    case 'arc': {
      const d = arcPath(cx, cy, rx, ry, s.a1 ?? 0, s.a2 ?? 90, !!s.sector);
      if (s.sector) return <ClosedShape s={s} id={id} box={gradFrame(s, m)?.box} transform={rot(cx, cy)} make={(p) => <path d={d} {...p} />} />;
      return <path d={d} fill="none" {...stroke} transform={rot(cx, cy)} />;
    }
    case 'polygon': {
      const pts = polyPoints(s.points).map(([a, b]) => [X(a), Y(b)] as [number, number]);
      if (pts.length < 2) return null;
      const closed = s.closed !== false && pts.length > 2;
      // an open line stops short of its heads, so it does not show through their tips
      const ends = (p: [number, number], q: [number, number], kind: ArrowHead): [number, number] => {
        const len = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
        const a = Math.min(len / 2, inset(kind, s.headSize));
        return [p[0] + ((q[0] - p[0]) / len) * a, p[1] + ((q[1] - p[1]) / len) * a];
      };
      const line = closed ? pts : [ends(pts[0], pts[1], s.head1), ...pts.slice(1, -1), ends(pts[pts.length - 1], pts[pts.length - 2], s.head2)];
      // smooth: a closed curve through the points (Catmull–Rom), or an open one (as a curve's spline)
      const path = (() => {
        if (!s.smooth || line.length < 3) return `M${line.map((p) => `${n2(p[0])},${n2(p[1])}`).join('L')}${closed ? 'Z' : ''}`;
        if (!closed) return splinePath(line.map((p) => p[0]), line.map((p) => p[1]));
        const n = line.length;
        let d = `M${n2(line[0][0])},${n2(line[0][1])}`;
        for (let k = 0; k < n; k++) {
          const [p0, p1, p2, p3] = [line[(k - 1 + n) % n], line[k], line[(k + 1) % n], line[(k + 2) % n]];
          d += `C${n2(p1[0] + (p2[0] - p0[0]) / 6)},${n2(p1[1] + (p2[1] - p0[1]) / 6)} ${n2(p2[0] - (p3[0] - p1[0]) / 6)},${n2(p2[1] - (p3[1] - p1[1]) / 6)} ${n2(p2[0])},${n2(p2[1])}`;
        }
        return `${d}Z`;
      })();
      const pc = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
      if (closed) return <ClosedShape s={s} id={id} box={gradFrame(s, m)?.box} transform={rot(pc[0], pc[1])} make={(p) => <path d={path} {...p} />} />;
      const angle = (p: [number, number], q: [number, number]) => Math.atan2(p[1] - q[1], p[0] - q[0]);
      return (
        <g transform={rot(pc[0], pc[1])}>
          {s.width > 0 && <path d={path} fill="none" {...stroke} strokeLinecap={s.cap ?? (s.join === 'round' ? 'round' : 'butt')} />}
          {head(s.head1, pts[0][0], pts[0][1], angle(pts[0], pts[1]), s.headSize, s.color, s.width)}
          {head(s.head2, pts[pts.length - 1][0], pts[pts.length - 1][1], angle(pts[pts.length - 1], pts[pts.length - 2]), s.headSize, s.color, s.width)}
        </g>
      );
    }
    case 'xband': {
      const [x, w] = [Math.min(x1, x2), Math.abs(x2 - x1)];
      return <ClosedShape s={s} id={id} box={gradFrame(s, m)?.box} color={s.color} outline={false} make={(p) => <rect x={n2(x)} y={n2(m.box.y)} width={n2(w)} height={n2(m.box.h)} {...p} />} />;
    }
    case 'yband': {
      const [y, h] = [Math.min(y1, y2), Math.abs(y2 - y1)];
      return <ClosedShape s={s} id={id} box={gradFrame(s, m)?.box} color={s.color} outline={false} make={(p) => <rect x={n2(m.box.x)} y={n2(y)} width={n2(m.box.w)} height={n2(h)} {...p} />} />;
    }
    case 'vline':
      return <line x1={n2(x1)} x2={n2(x1)} y1={n2(m.box.y)} y2={n2(m.box.y + m.box.h)} {...stroke} />;
    case 'hline':
      return <line x1={n2(m.box.x)} x2={n2(m.box.x + m.box.w)} y1={n2(y1)} y2={n2(y1)} {...stroke} />;
    case 'bracket': {
      const t = resolveText(s.textStyle, defaults);
      const { p1, p2, n } = bracketBase(s, X, Y);
      const b = bracketPath(p1, p2, n, s.headSize, s.leg2 ?? s.headSize, s.bstyle);
      const tp = bracketTextPlace(p1, p2, n, b.depth, s.textGap ?? 1.5, s.textDir, s.textAngle);
      return (
        <g>
          <path d={b.d} fill="none" {...stroke} />
          {s.text && (
            <g transform={tp.rotate ? `rotate(${n2(tp.rotate)} ${n2(tp.x)} ${n2(tp.y)})` : undefined}>
              <RichText x={tp.x} y={tp.y} text={s.text} st={t} anchor={tp.anchor} valign={tp.valign} />
            </g>
          )}
        </g>
      );
    }
    case 'callout': {
      const t = resolveText(s.textStyle, defaults);
      const bx = calloutBox(s, t, x1, y1);
      // the line from the edge of the box to the point (none when the point is inside it)
      const [dx, dy] = [x2 - x1, y2 - y1];
      const k = Math.min(dx ? bx.w / 2 / Math.abs(dx) : Infinity, dy ? bx.h / 2 / Math.abs(dy) : Infinity);
      const from: Pt = [x1 + dx * Math.min(1, k), y1 + dy * Math.min(1, k)];
      const len = Math.hypot(x2 - from[0], y2 - from[1]);
      const ang = Math.atan2(y2 - from[1], x2 - from[0]);
      const back = Math.min(len / 2, inset(s.head2, s.headSize));
      const box = { ...s, fill: s.fill || '#ffffff' };
      return (
        <g>
          {k < 1 && len > 0.5 && (
            <g opacity={s.opacity < 1 ? s.opacity : undefined}>
              <line x1={n2(from[0])} y1={n2(from[1])} x2={n2(x2 - Math.cos(ang) * back)} y2={n2(y2 - Math.sin(ang) * back)} {...stroke} strokeOpacity={undefined} />
              {head(s.head2, x2, y2, ang, s.headSize, s.color, s.width)}
            </g>
          )}
          <ClosedShape s={box} id={id} box={bx} make={(p) => <rect x={n2(bx.x)} y={n2(bx.y)} width={n2(bx.w)} height={n2(bx.h)} rx={s.radius ? n2(Math.min(s.radius, bx.h / 2, bx.w / 2)) : undefined} {...p} />} />
          <RichText x={x1} y={bx.y + bx.pad} text={s.text} st={t} anchor="middle" valign="top" />
        </g>
      );
    }
    case 'path': {
      const segs = mapSegs(parsePath(s.d), ([u, v]): Pt => [X(u), Y(v)]);
      const b = pathBox(segs);
      if (!b || !segs.length) return null;
      const d = pathText(segs);
      // an open path: its heads at its first point and its last one
      const lines = pathClosed(segs) ? [] : pathPolylines(segs).filter((l) => l.length > 1);
      const ends = lines.length ? endAngles(lines[0]) : null;
      const last = lines.length ? endAngles(lines[lines.length - 1]) : null;
      const first = lines[0]?.[0];
      const lastPt = lines.length ? lines[lines.length - 1][lines[lines.length - 1].length - 1] : undefined;
      return (
        <g transform={rot(b.x + b.w / 2, b.y + b.h / 2)}>
          <ClosedShape s={s} id={id} box={b} make={(p) => <path d={d} fillRule={s.evenodd ? 'evenodd' : undefined} {...p} />} />
          {ends && first && head(s.head1, first[0], first[1], ends.ang1, s.headSize, s.color, s.width)}
          {last && lastPt && head(s.head2, lastPt[0], lastPt[1], last.ang2, s.headSize, s.color, s.width)}
        </g>
      );
    }
    case 'image': {
      const [x, y, w, h] = [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
      return (
        <g transform={rot(x + w / 2, y + h / 2)}>
          {s.href ? <image href={s.href} x={n2(x)} y={n2(y)} width={n2(w)} height={n2(h)} preserveAspectRatio={s.stretch ? 'none' : 'xMidYMid meet'} opacity={s.opacity < 1 ? s.opacity : undefined} /> : <rect x={n2(x)} y={n2(y)} width={n2(w)} height={n2(h)} fill="#eeeeee" stroke="#999999" strokeDasharray="3 2" strokeWidth={0.5} />}
          {s.width > 0 && <rect x={n2(x)} y={n2(y)} width={n2(w)} height={n2(h)} fill="none" {...stroke} />}
        </g>
      );
    }
    case 'component':
      return null;
    case 'scalebar': {
      const t = resolveText(s.textStyle, defaults);
      const e = scaleEnd(s, m, x1, y1);
      const c = s.headSize / 2;
      const label = s.text || String(+scaleLength(s, m).toPrecision(4));
      const v = !!s.vertical;
      const d = v ? `M${n2(x1 - c)},${n2(y1)}h${n2(2 * c)}M${n2(x1)},${n2(y1)}V${n2(e[1])}M${n2(x1 - c)},${n2(e[1])}h${n2(2 * c)}` : `M${n2(x1)},${n2(y1 - c)}v${n2(2 * c)}M${n2(x1)},${n2(y1)}H${n2(e[0])}M${n2(e[0])},${n2(y1 - c)}v${n2(2 * c)}`;
      return (
        <g>
          <path d={d} fill="none" {...stroke} />
          {v ? <RichText x={x1 - c - 2} y={(y1 + e[1]) / 2} text={label} st={t} anchor="end" valign="middle" num={!s.text} /> : <RichText x={(x1 + e[0]) / 2} y={y1 + c + 1.5} text={label} st={t} anchor="middle" valign="top" num={!s.text} />}
        </g>
      );
    }
  }
}

function TextView({ s, m, defaults, id = 'txt' }: { s: TextSpec; m: Mapper; defaults: TextDefaults; id?: string }) {
  const t = resolveText(s.style, defaults);
  // along another object's outline: from pathAt of its length (the anchor: where the text starts, its middle or end is)
  if (s.pathD) {
    const P = (v: number, ax: 'x' | 'y') => (s.coords === 'data' ? (ax === 'x' ? m.x(v) : m.y(v)) : ax === 'x' ? m.box.x + (v / 100) * m.box.w : m.box.y + (v / 100) * m.box.h);
    const segs = mapSegs(parsePath(s.pathD), ([u, v]): Pt => [P(u, 'x'), P(v, 'y')]);
    const ha = ANCHOR_H[s.anchor];
    return (
      <g>
        <defs>
          <path id={`${id}-p`} d={pathText(segs)} />
        </defs>
        <text fontFamily={t.font} fontSize={t.size} fill={t.color} fontWeight={t.bold ? 'bold' : undefined} fontStyle={t.italic ? 'italic' : undefined} textAnchor={ha} dy={n2((ANCHOR_V[s.anchor] === 'top' ? t.size * 0.8 : ANCHOR_V[s.anchor] === 'middle' ? t.size * 0.35 : 0) - (s.pathGap ?? 0))}>
          <textPath href={`#${id}-p`} startOffset={`${n2((s.pathAt ?? (ha === 'middle' ? 0.5 : ha === 'end' ? 1 : 0)) * 100)}%`}>
            {plainText(s.text)}
          </textPath>
        </text>
      </g>
    );
  }
  const x = s.coords === 'data' ? m.x(s.x) : m.box.x + (s.x / 100) * m.box.w;
  const y = s.coords === 'data' ? m.y(s.y) : m.box.y + (s.y / 100) * m.box.h;
  const mt = richMetrics(s.text, t);
  const w = mt.width + 2 * s.padding;
  const h = mt.lines * mt.lineHeight + 2 * s.padding - (mt.lineHeight - t.size) * 0.6;
  const b = boxAt(s.anchor, x, y, w, h);
  // its lines: as asked, else as its anchor
  const ha = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : s.align === 'left' || s.align === 'justify' ? 'start' : ANCHOR_H[s.anchor];
  const tx = ha === 'start' ? b.x + s.padding : ha === 'middle' ? b.x + w / 2 : b.x + w - s.padding;
  return (
    <g transform={s.rotation ? `rotate(${n2(s.rotation)} ${n2(x)} ${n2(y)})` : undefined}>
      {s.box !== 'none' && s.shadow && <rect x={n2(b.x + 1.5)} y={n2(b.y + 1.5)} width={n2(w)} height={n2(h)} rx={s.radius ? n2(Math.min(s.radius, h / 2)) : undefined} fill="#000000" fillOpacity={0.35} />}
      {s.box !== 'none' && (
        <rect
          x={n2(b.x)}
          y={n2(b.y)}
          width={n2(w)}
          height={n2(h)}
          rx={s.radius ? n2(Math.min(s.radius, h / 2, w / 2)) : undefined}
          fill={s.box === 'fill' || s.box === 'both' ? s.boxColor : s.shadow ? '#ffffff' : 'none'}
          fillOpacity={s.boxOpacity ?? undefined}
          stroke={s.box === 'border' || s.box === 'both' ? s.borderColor : 'none'}
          strokeWidth={s.borderWidth}
          strokeDasharray={s.box === 'border' || s.box === 'both' ? dashArray(s.borderDash ?? 'solid', s.borderWidth) : undefined}
          strokeOpacity={s.borderOpacity ?? undefined}
        />
      )}
      <RichText x={tx} y={b.y + s.padding} text={s.text} st={t} anchor={ha} valign="top" num={!!s.numbers} justify={s.align === 'justify' && mt.lines > 1 ? mt.width : undefined} />
    </g>
  );
}

const SIDE_FOR_BAR: SideStyle = { ...SIDE_DEFAULTS };

function ColorbarView({ bar, curve, m, defaults, gid }: { bar: ColorbarSpec; curve: Curve | null; m: Mapper; defaults: TextDefaults; gid: string }) {
  // a curve coloured by a map, or the curves of a split coloured by the map of their values
  const byGroup = curve?.group?.color === 'map';
  if (!curve || ((curve.style.colorBy === 'none' || curve.style.categorical) && !byGroup) || !curve.colorRange) return null;
  const st = curve.style;
  const title = bar.title || (byGroup && curve.group!.name ? curve.group!.name : '');
  const t = resolveText(bar.text, defaults);
  const [lo, hi] = curve.colorRange;
  const vert = bar.orientation === 'vertical';
  const x = m.box.x + (bar.x / 100) * m.box.w;
  const y = m.box.y + (bar.y / 100) * m.box.h;
  const len = (bar.length / 100) * (vert ? m.box.h : m.box.w);
  const th = bar.thickness;
  const stops = stopsOf(st.cmap, st.cmapColors);
  const N = 24;
  const tickVals: number[] = [];
  if (st.cmapLog && lo > 0) {
    for (let d = Math.ceil(Math.log10(lo) - 1e-9); d <= Math.floor(Math.log10(hi) + 1e-9); d++) tickVals.push(10 ** d);
  } else {
    const step = niceStep(hi - lo, Math.max(2, bar.ticks));
    for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) tickVals.push(Math.abs(k * step) < step * 1e-9 ? 0 : k * step);
  }
  const fmt = formatLabels(tickVals, st.cmapLog, SIDE_FOR_BAR);
  const lw = Math.max(0.4, bar.frameWidth);
  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0" y1={vert ? '1' : '0'} x2={vert ? '0' : '1'} y2="0">
          {Array.from({ length: N + 1 }, (_, k) => (
            <stop key={k} offset={k / N} stopColor={mapColor(stops, st.cmapReverse ? 1 - k / N : k / N)} />
          ))}
        </linearGradient>
      </defs>
      <rect x={n2(x)} y={n2(y)} width={n2(vert ? th : len)} height={n2(vert ? len : th)} fill={`url(#${gid})`} stroke={bar.frameWidth > 0 ? '#000000' : 'none'} strokeWidth={bar.frameWidth} />
      {tickVals.map((v, k) => {
        const p = mapT(v, lo, hi, st.cmapLog, false);
        if (v < Math.min(lo, hi) - 1e-12 || v > Math.max(lo, hi) + 1e-12) return null;
        if (vert) {
          const yy = y + len - p * len;
          return (
            <g key={k}>
              <line x1={n2(x + th)} x2={n2(x + th + 2)} y1={n2(yy)} y2={n2(yy)} stroke="#000000" strokeWidth={lw} />
              <RichText x={x + th + 3.5} y={yy} text={fmt.labels[k]} st={t} valign="middle" num />
            </g>
          );
        }
        const xx = x + p * len;
        return (
          <g key={k}>
            <line x1={n2(xx)} x2={n2(xx)} y1={n2(y + th)} y2={n2(y + th + 2)} stroke="#000000" strokeWidth={lw} />
            <RichText x={xx} y={y + th + 3} text={fmt.labels[k]} st={t} anchor="middle" valign="top" num />
          </g>
        );
      })}
      {title && (vert ? <RichText x={x + th / 2} y={y - 3} text={title} st={t} anchor="middle" valign="bottom" /> : <RichText x={x + len / 2} y={y + th + 4 + t.size * 1.3} text={title} st={t} anchor="middle" valign="top" />)}
    </g>
  );
}

// The new coordinates of an annotation moved by (dx, dy) pt: in % of its container, or in the units of the data.
function moved(m: Mapper, coords: 'data' | 'percent') {
  const mx = (v: number, dx: number) => (coords === 'data' ? r5(m.ix(m.x(v) + dx)) : r1(v + (dx / m.box.w) * 100));
  const my = (v: number, dy: number) => (coords === 'data' ? r5(m.iy(m.y(v) + dy)) : r1(v + (dy / m.box.h) * 100));
  return { mx, my };
}
// A small square on a point of a shape: dragging it moves that point only (shown when the mouse is over the shape).
// anchor: a path's node (its number: the drawing editor removes it on a double-click); round: a curve's control point
function Handle({ x, y, info, anchor, round, on }: { x: number; y: number; info: DragInfo; anchor?: number; round?: boolean; on?: boolean }) {
  const k = useContext(HandleScale);
  return (
    <Draggable info={info}>
      {round ? (
        <circle data-export="skip" className="shape-handle" cx={n2(x)} cy={n2(y)} r={n2(2.2 * k)} fill="#14b8a6" stroke="#ffffff" strokeWidth={n2(0.6 * k)} />
      ) : (
        <rect data-export="skip" data-anchor={anchor} className="shape-handle" x={n2(x - 2.8 * k)} y={n2(y - 2.8 * k)} width={n2(5.6 * k)} height={n2(5.6 * k)} fill={on ? '#14b8a6' : '#ffffff'} stroke="#14b8a6" strokeWidth={n2(0.8 * k)} />
      )}
    </Draggable>
  );
}
type Patch = (dx: number, dy: number, shift: boolean) => Record<string, unknown>;
// A small round handle that turns a part about (cx, cy): set at `deg` degrees (clockwise from up), r pt away; Shift:
// by 15°.
function RotateHandle({ cx, cy, r, deg, info }: { cx: number; cy: number; r: number; deg: number; info: (p: Patch) => DragInfo }) {
  const k = useContext(HandleScale);
  const a = (deg * Math.PI) / 180;
  const [hx, hy] = [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  return (
    <Draggable
      info={info((dx, dy, shift) => {
        let d = (Math.atan2(hx + dx - cx, -(hy + dy - cy)) * 180) / Math.PI;
        d = shift ? Math.round(d / 15) * 15 : Math.round(d);
        if (d > 180) d -= 360;
        return { rotation: d };
      })}
    >
      <circle data-export="skip" className="shape-handle" cx={n2(hx)} cy={n2(hy)} r={n2(3 * k)} fill="#ffffff" stroke="#14b8a6" strokeWidth={n2(0.8 * k)} />
    </Draggable>
  );
}
// The two edges of a range of x: each a strip over the frame's height (the mouse turns ↔ on it, a line shows it),
// dragged alone — the band itself does not move.
function RangeEdges({ s, m, info }: { s: ShapeSpec; m: Mapper; info: (patch: Patch) => DragInfo }) {
  const on = useContext(Interactive);
  if (!on) return null;
  const { mx } = moved(m, s.coords);
  const X = (v: number) => (s.coords === 'data' ? m.x(v) : m.box.x + (v / 100) * m.box.w);
  const edge = (x: number, apply: Patch, k: string) =>
    Number.isFinite(x) && x >= m.box.x - 0.5 && x <= m.box.x + m.box.w + 0.5 ? (
      <Draggable key={k} info={info(apply)}>
        <g data-export="skip" className="range-edge">
          <rect x={n2(x - 3)} y={n2(m.box.y)} width={6} height={n2(m.box.h)} fill="transparent" />
          <line x1={n2(x)} x2={n2(x)} y1={n2(m.box.y)} y2={n2(m.box.y + m.box.h)} stroke="#e69f00" strokeWidth={1.5} />
        </g>
      </Draggable>
    ) : null;
  return (
    <g>
      {edge(X(s.x1), (dx) => ({ x1: mx(s.x1, dx) }), '1')}
      {edge(X(s.x2), (dx) => ({ x2: mx(s.x2, dx) }), '2')}
    </g>
  );
}
// A path's handles: a square on every node (dragged with its curve's controls), a dot on every control point of a curve
// (a smooth node's other control turned with it), the controls joined to their nodes by thin lines. Turned: only the
// turning handle.
function PathHandles({ s, m, info, item }: { s: ShapeSpec; m: Mapper; info: (patch: Patch) => DragInfo; item?: string }) {
  const k = useContext(HandleScale);
  const pickedNodes = useContext(PickedNodes);
  const picked = pickedNodes && pickedNodes.item === item ? pickedNodes.nodes : [];
  const { mx, my } = moved(m, s.coords);
  const X = (v: number) => (s.coords === 'data' ? m.x(v) : m.box.x + (v / 100) * m.box.w);
  const Y = (v: number) => (s.coords === 'data' ? m.y(v) : m.box.y + (v / 100) * m.box.h);
  const segs = parsePath(s.d);
  // the turning handle above its box (it turns about the box's middle)
  const pb = pathBox(mapSegs(segs, ([u, v]): Pt => [X(u), Y(v)]));
  const turn = pb ? <RotateHandle key="r" cx={pb.x + pb.w / 2} cy={pb.y + pb.h / 2} r={pb.h / 2 + 9} deg={s.rotation || 0} info={info} /> : null;
  if (s.rotation) return <g>{turn}</g>;
  // every subpath: its first segment, its last drawn one, closed or not
  const subOf = (i: number) => {
    let a = i;
    while (a > 0 && segs[a].c !== 'M') a--;
    let b = a + 1;
    while (b < segs.length && segs[b].c !== 'M') b++;
    const closed = segs[b - 1]?.c === 'Z';
    const lastDrawn = closed ? b - 2 : b - 1;
    return { a, lastDrawn, closed };
  };
  const end = (q: { p: number[] }): Pt => [q.p[q.p.length - 2], q.p[q.p.length - 1]];
  const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
  const write = (list: { c: string; p: number[] }[]) => ({ d: pathText(list as never) });
  // a node moved: its point, the control into it and the one out of it
  const moveNode = (i: number, dx: number, dy: number) => {
    const out = segs.map((q) => ({ c: q.c, p: q.p.slice() }));
    const mv = (j: number, at: number) => {
      out[j].p[at] = mx(segs[j].p[at], dx);
      out[j].p[at + 1] = my(segs[j].p[at + 1], dy);
    };
    const shift = (j: number) => {
      const q = segs[j];
      mv(j, q.p.length - 2);
      if (q.c === 'C') mv(j, 2);
      const nx = segs[j + 1];
      if (nx?.c === 'C') mv(j + 1, 0);
    };
    shift(i);
    // the start of a closed subpath: also the last node when it ends there
    const { a, lastDrawn, closed } = subOf(i);
    if (closed && i === a && lastDrawn > a && same(end(segs[lastDrawn]), end(segs[a]))) {
      const q = segs[lastDrawn];
      mv(lastDrawn, q.p.length - 2);
      if (q.c === 'C') mv(lastDrawn, 2);
    }
    return write(out);
  };
  // a control point moved; the node's other control turned to stay in line when it was (a smooth node)
  const moveControl = (i: number, which: 0 | 2, dx: number, dy: number) => {
    const out = segs.map((q) => ({ c: q.c, p: q.p.slice() }));
    const [cx, cy] = [mx(segs[i].p[which], dx), my(segs[i].p[which + 1], dy)];
    out[i].p[which] = cx;
    out[i].p[which + 1] = cy;
    // the node this control belongs to, and its other control
    const nodeAt: Pt = which === 2 ? end(segs[i]) : end(segs[i - 1] ?? segs[i]);
    let other: { j: number; at: number } | null = null;
    if (which === 2 && segs[i + 1]?.c === 'C') other = { j: i + 1, at: 0 };
    if (which === 0 && segs[i - 1]?.c === 'C') other = { j: i - 1, at: 2 };
    if (other) {
      const o: Pt = [segs[other.j].p[other.at], segs[other.j].p[other.at + 1]];
      const c0: Pt = [segs[i].p[which], segs[i].p[which + 1]];
      const [ux, uy] = [c0[0] - nodeAt[0], c0[1] - nodeAt[1]];
      const [vx, vy] = [o[0] - nodeAt[0], o[1] - nodeAt[1]];
      const lu = Math.hypot(ux, uy);
      const lv = Math.hypot(vx, vy);
      // in line, on opposite sides: kept so
      if (lu > 1e-9 && lv > 1e-9 && (ux * vx + uy * vy) / (lu * lv) < -0.999) {
        const [nx, ny] = [cx - nodeAt[0], cy - nodeAt[1]];
        const ln = Math.hypot(nx, ny) || 1;
        out[other.j].p[other.at] = +(nodeAt[0] - (nx / ln) * lv).toFixed(4);
        out[other.j].p[other.at + 1] = +(nodeAt[1] - (ny / ln) * lv).toFixed(4);
      }
    }
    return write(out);
  };
  const nodes: ReactNode[] = [];
  const guides: string[] = [];
  segs.forEach((q, i) => {
    if (q.c === 'Z') return;
    const p = end(q);
    const { a, lastDrawn, closed } = subOf(i);
    // the last node of a closed subpath back on its start: one handle
    if (!(closed && i === lastDrawn && i > a && same(p, end(segs[a])))) nodes.push(<Handle key={`n${i}`} x={X(p[0])} y={Y(p[1])} anchor={i} on={picked.includes(i)} info={info((dx, dy) => moveNode(i, dx, dy))} />);
    if (q.c === 'C') {
      const from = end(segs[i - 1] ?? q);
      for (const which of [0, 2] as const) {
        const c: Pt = [q.p[which], q.p[which + 1]];
        const base = which === 0 ? from : p;
        if (same(c, base)) continue;
        guides.push(`M${n2(X(base[0]))},${n2(Y(base[1]))}L${n2(X(c[0]))},${n2(Y(c[1]))}`);
        nodes.push(<Handle key={`c${i}-${which}`} x={X(c[0])} y={Y(c[1])} round info={info((dx, dy) => moveControl(i, which, dx, dy))} />);
      }
    }
  });
  return (
    <g>
      {guides.length > 0 && <path data-export="skip" className="shape-handle" d={guides.join('')} fill="none" stroke="#14b8a6" strokeWidth={n2(0.5 * k)} />}
      {nodes}
      {turn}
    </g>
  );
}

// A gradient's handles (a shape filled with one), as Affinity's gradient tool: linear — its start (a dot) and its end
// (a square) joined by a line; radial — its centre, and the ends of its radius across and of its radius down, on its
// ellipse. Dragged, that place moves (Shift: an end of a linear one turned by steps of 15° about the other; a radius:
// the ellipse made a circle).
function GradHandles({ s, m, info }: { s: ShapeSpec; m: Mapper; info: (patch: Patch) => DragInfo }) {
  const on = useContext(Interactive);
  const k = useContext(HandleScale);
  const band = s.kind === 'xband' || s.kind === 'yband';
  if (!on || !s.grad || s.grad === 'none' || !(s.fill || band)) return null;
  const f = gradFrame(s, m);
  if (!f || !(f.box.w > 0) || !(f.box.h > 0)) return null;
  const { box: b, c } = f;
  const turn = !band && s.rotation ? s.rotation : 0;
  // a drag (pt on the page) as a move in the box (% of it): turned back first
  const a = (-turn * Math.PI) / 180;
  const toBox = (dx: number, dy: number): Pt => [((dx * Math.cos(a) - dy * Math.sin(a)) / b.w) * 100, ((dx * Math.sin(a) + dy * Math.cos(a)) / b.h) * 100];
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const C = '#f59e0b';
  const guide = { fill: 'none', stroke: C, strokeWidth: n2(0.8 * k), strokeDasharray: `${n2(2.5 * k)} ${n2(1.5 * k)}`, pointerEvents: 'none' as const };
  const dot = (x: number, y: number, apply: Patch, key: string, square = false) => (
    <Draggable key={key} info={info(apply)}>
      {square ? (
        <rect className="shape-handle" x={n2(x - 2.6 * k)} y={n2(y - 2.6 * k)} width={n2(5.2 * k)} height={n2(5.2 * k)} fill="#ffffff" stroke={C} strokeWidth={n2(1 * k)} />
      ) : (
        <circle className="shape-handle" cx={n2(x)} cy={n2(y)} r={n2(2.8 * k)} fill={C} stroke="#ffffff" strokeWidth={n2(0.8 * k)} />
      )}
    </Draggable>
  );
  let parts: ReactNode;
  if (s.grad === 'radial') {
    const g = radialPlace(s);
    const [cx, cy] = inBox(b, [g.cx, g.cy]);
    const [rx, ry] = [(g.rx / 100) * (b.w / 2), (g.ry / 100) * (b.h / 2)];
    parts = (
      <>
        <ellipse className="shape-handle" cx={n2(cx)} cy={n2(cy)} rx={n2(Math.abs(rx))} ry={n2(Math.abs(ry))} {...guide} />
        <path className="shape-handle" d={`M${n2(cx + rx)},${n2(cy)}L${n2(cx)},${n2(cy)}L${n2(cx)},${n2(cy + ry)}`} {...guide} />
        {dot(cx, cy, (dx, dy) => {
          const [u, v] = toBox(dx, dy);
          return { gradCx: r2(g.cx + u), gradCy: r2(g.cy + v), gradR: g.rx, gradR2: g.ry };
        }, 'c')}
        {dot(cx + rx, cy, (dx, dy, shift) => {
          const nx = r2(Math.max(0.5, g.rx + 2 * toBox(dx, dy)[0]));
          return { gradCx: g.cx, gradCy: g.cy, gradR: nx, gradR2: shift ? r2((nx * b.w) / b.h) : g.ry };
        }, 'rx', true)}
        {dot(cx, cy + ry, (dx, dy, shift) => {
          const ny = r2(Math.max(0.5, g.ry + 2 * toBox(dx, dy)[1]));
          return { gradCx: g.cx, gradCy: g.cy, gradR: shift ? r2((ny * b.h) / b.w) : g.rx, gradR2: ny };
        }, 'ry', true)}
      </>
    );
  } else {
    const [p, q] = linearEnds(s);
    const [P, Q] = [inBox(b, p), inBox(b, q)];
    // an end moved; Shift: its direction from the other end by steps of 15° (as its angle is given: in the box's own
    // terms, 45° from corner to corner), its length kept
    const end = (mine: Pt, other: Pt, dx: number, dy: number, shift: boolean): Pt => {
      const [u, v] = toBox(dx, dy);
      let e: Pt = [mine[0] + u, mine[1] + v];
      if (shift) {
        const L = Math.hypot(e[0] - other[0], e[1] - other[1]);
        const t = Math.round(Math.atan2(e[1] - other[1], e[0] - other[0]) / (Math.PI / 12)) * (Math.PI / 12);
        e = [other[0] + L * Math.cos(t), other[1] + L * Math.sin(t)];
      }
      return [r2(e[0]), r2(e[1])];
    };
    parts = (
      <>
        <line className="shape-handle" x1={n2(P[0])} y1={n2(P[1])} x2={n2(Q[0])} y2={n2(Q[1])} {...guide} />
        {dot(P[0], P[1], (dx, dy, shift) => {
          const e = end(p, q, dx, dy, shift);
          return { gradX1: e[0], gradY1: e[1], gradX2: q[0], gradY2: q[1] };
        }, 'p')}
        {dot(Q[0], Q[1], (dx, dy, shift) => {
          const e = end(q, p, dx, dy, shift);
          return { gradX1: p[0], gradY1: p[1], gradX2: e[0], gradY2: e[1] };
        }, 'q', true)}
      </>
    );
  }
  return (
    <g data-export="skip" transform={turn ? `rotate(${n2(turn)} ${n2(c[0])} ${n2(c[1])})` : undefined}>
      {parts}
    </g>
  );
}
function ShapeHandles({ s, m, info, item }: { s: ShapeSpec; m: Mapper; info: (patch: Patch) => DragInfo; item?: string }) {
  const on = useContext(Interactive);
  if (!on) return null;
  const { mx, my } = moved(m, s.coords);
  const X = (v: number) => (s.coords === 'data' ? m.x(v) : m.box.x + (v / 100) * m.box.w);
  const Y = (v: number) => (s.coords === 'data' ? m.y(v) : m.box.y + (v / 100) * m.box.h);
  const h = (x: number, y: number, apply: Patch, k: string) => <Handle key={k} x={x} y={y} info={info(apply)} />;
  const midY = m.box.y + m.box.h / 2;
  const midX = m.box.x + m.box.w / 2;
  const corners = () => [h(X(s.x1), Y(s.y1), (dx, dy) => ({ x1: mx(s.x1, dx), y1: my(s.y1, dy) }), '1'), h(X(s.x2), Y(s.y2), (dx, dy) => ({ x2: mx(s.x2, dx), y2: my(s.y2, dy) }), '2')];
  // the turning handle above the middle of the box
  const turn = () => {
    const [cx, cy] = [(X(s.x1) + X(s.x2)) / 2, (Y(s.y1) + Y(s.y2)) / 2];
    return <RotateHandle key="r" cx={cx} cy={cy} r={Math.abs(Y(s.y2) - Y(s.y1)) / 2 + 9} deg={s.rotation || 0} info={info} />;
  };
  switch (s.kind) {
    case 'line':
    case 'arrow': {
      // the ends, and the middle: dragged aside it bends the line
      const [p1, p2]: Pt[] = [
        [X(s.x1), Y(s.y1)],
        [X(s.x2), Y(s.y2)],
      ];
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
      // an elbow: its ends, and its middle piece (hvh, vhv) dragged across or up and down
      if (s.route && s.route !== 'line') {
        const r = s.route;
        const k = s.elbowAt ?? 0.5;
        const c = elbowCorners(p1, p2, r, k);
        const middle =
          r === 'hvh' || r === 'vhv'
            ? h((c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2, (dx, dy) => {
                const span = r === 'hvh' ? p2[0] - p1[0] : p2[1] - p1[1];
                const at = r === 'hvh' ? c[1][0] + dx - p1[0] : c[1][1] + dy - p1[1];
                return { elbowAt: Math.abs(span) > 1e-9 ? Math.round(Math.max(0, Math.min(1, at / span)) * 1000) / 1000 : 0.5 };
              }, 'e')
            : null;
        return (
          <g>
            {corners()}
            {middle}
          </g>
        );
      }
      // through bends: a handle on each (dragged: that bend moves)
      const bends = bendPoints(s.bends);
      if (bends.length)
        return (
          <g>
            {corners()}
            {bends.map(([u, v], k) => h(X(u), Y(v), (dx, dy) => ({ bends: bendText(bends.map((q, j): Pt => (j === k ? [mx(q[0], dx), my(q[1], dy)] : q))) }), `b${k}`))}
          </g>
        );
      const b = bentLine(p1, p2, s.curve ?? 0, 0, 0);
      return (
        <g>
          {corners()}
          {h(b.mid[0], b.mid[1], (dx, dy) => ({ curve: Math.round(Math.max(-1.5, Math.min(1.5, (s.curve ?? 0) + (2 * (dx * b.side[0] + dy * b.side[1])) / L)) * 100) / 100 }), 'c')}
        </g>
      );
    }
    case 'rect':
    case 'ellipse':
    case 'star':
    case 'regular':
    case 'arc':
      return (
        <g>
          {corners()}
          {turn()}
        </g>
      );
    case 'callout':
      return <g>{corners()}</g>;
    case 'image':
      return (
        <g>
          {corners()}
          {turn()}
        </g>
      );
    case 'path':
      return <PathHandles s={s} m={m} info={info} item={item} />;
    case 'dimension': {
      // its ends, and its line: dragged aside, further from them or nearer
      const [p1, p2]: Pt[] = [
        [X(s.x1), Y(s.y1)],
        [X(s.x2), Y(s.y2)],
      ];
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
      const n = aboveOf([(p2[0] - p1[0]) / L, (p2[1] - p1[1]) / L]);
      const o = s.offset ?? 8;
      return (
        <g>
          {corners()}
          {h((p1[0] + p2[0]) / 2 + n[0] * o, (p1[1] + p2[1]) / 2 + n[1] * o, (dx, dy) => ({ offset: Math.round((o + dx * n[0] + dy * n[1]) * 10) / 10 }), 'o')}
        </g>
      );
    }
    case 'scalebar': {
      // its far end: dragged, a new length (in the units of the data)
      const [x0, y0] = [X(s.x1), Y(s.y1)];
      const e = scaleEnd(s, m, x0, y0);
      return (
        <g>
          {h(x0, y0, (dx, dy) => ({ x1: mx(s.x1, dx), y1: my(s.y1, dy) }), '1')}
          {h(e[0], e[1], (dx, dy) => {
            const len = s.vertical ? Math.abs(m.iy(e[1] + dy) - m.iy(y0)) : Math.abs(m.ix(e[0] + dx) - m.ix(x0));
            return { len: +len.toPrecision(2) || scaleLength(s, m) };
          }, '2')}
        </g>
      );
    }
    case 'xband':
      return (
        <g>
          {h(X(s.x1), midY, (dx) => ({ x1: mx(s.x1, dx) }), '1')}
          {h(X(s.x2), midY, (dx) => ({ x2: mx(s.x2, dx) }), '2')}
        </g>
      );
    case 'bracket': {
      // its ends (each one where its orientation lets it go) and the end of its first leg (its length)
      const o = s.orient ?? 'down';
      const { p1, p2, n } = bracketBase(s, X, Y);
      const end2: Patch = o === 'down' || o === 'up' ? (dx, dy) => ({ x2: mx(s.x2, dx), y1: my(s.y1, dy) }) : o === 'free' ? (dx, dy) => ({ x2: mx(s.x2, dx), y2: my(s.y2, dy) }) : (dx, dy) => ({ x1: mx(s.x1, dx), y2: my(s.y2, dy) });
      const leg = s.bstyle === 'bar' ? s.headSize / 2 : s.bstyle === 'curly' ? s.headSize / 2 : s.headSize;
      return (
        <g>
          {h(p1[0], p1[1], (dx, dy) => ({ x1: mx(s.x1, dx), y1: my(s.y1, dy) }), '1')}
          {h(p2[0], p2[1], end2, '2')}
          {h(p1[0] + n[0] * leg, p1[1] + n[1] * leg, (dx, dy) => ({ headSize: Math.max(0, +(s.headSize + (dx * n[0] + dy * n[1]) * (s.bstyle === 'square' || !s.bstyle ? 1 : 2)).toFixed(1)) }), 'l')}
        </g>
      );
    }
    case 'yband':
      return (
        <g>
          {h(midX, Y(s.y1), (_dx, dy) => ({ y1: my(s.y1, dy) }), '1')}
          {h(midX, Y(s.y2), (_dx, dy) => ({ y2: my(s.y2, dy) }), '2')}
        </g>
      );
    case 'polygon': {
      const pts = polyPoints(s.points);
      return (
        <g>
          {pts.map(([u, v], k) =>
            h(
              X(u),
              Y(v),
              (dx, dy) => ({ points: pts.map(([a, b], j) => (j === k ? `${mx(a, dx)} ${my(b, dy)}` : `${a} ${b}`)).join('; ') }),
              String(k),
            ),
          )}
        </g>
      );
    }
    default:
      return null;
  }
}

// The far end of a colour bar: dragging it changes its length.
function BarHandle({ b, m, info }: { b: ColorbarSpec; m: Mapper; info: (patch: Patch) => DragInfo }) {
  const on = useContext(Interactive);
  if (!on) return null;
  const vert = b.orientation === 'vertical';
  const x = m.box.x + (b.x / 100) * m.box.w;
  const y = m.box.y + (b.y / 100) * m.box.h;
  const len = (b.length / 100) * (vert ? m.box.h : m.box.w);
  return (
    <Handle
      x={vert ? x + b.thickness / 2 : x + len}
      y={vert ? y + len : y + b.thickness / 2}
      info={info((dx, dy) => ({ length: r1(Math.max(2, b.length + (vert ? (dy / m.box.h) * 100 : (dx / m.box.w) * 100))) }))}
    />
  );
}
// The turning handle of a text annotation: above it, about its point.
function TextHandles({ s, m, defaults, info }: { s: TextSpec; m: Mapper; defaults: TextDefaults; info: (patch: Patch) => DragInfo }) {
  const on = useContext(Interactive);
  if (!on) return null;
  const t = resolveText(s.style, defaults);
  const x = s.coords === 'data' ? m.x(s.x) : m.box.x + (s.x / 100) * m.box.w;
  const y = s.coords === 'data' ? m.y(s.y) : m.box.y + (s.y / 100) * m.box.h;
  const mt = richMetrics(s.text, t);
  const hgt = mt.lines * mt.lineHeight + 2 * s.padding;
  const b = boxAt(s.anchor, x, y, mt.width + 2 * s.padding, hgt);
  return <RotateHandle cx={x} cy={y} r={Math.max(8, y - b.y + 8)} deg={s.rotation || 0} info={info} />;
}

function AnnotationView({ a, m, defaults, idPrefix }: { a: Annotation; m: Mapper; defaults: TextDefaults; idPrefix: string }) {
  const info = (patch: Patch) => dragOf(a.key, a.owner, patch);
  if (a.kind === 'shape') {
    const s = a.shape;
    const apply = (dx: number, dy: number) => {
      const { mx, my } = moved(m, s.coords);
      if (s.kind === 'polygon') return { points: polyPoints(s.points).map(([u, v]) => `${mx(u, dx)} ${my(v, dy)}`).join('; ') };
      if (s.kind === 'path') return { d: pathText(mapSegs(parsePath(s.d), ([u, v]): Pt => [mx(u, dx), my(v, dy)])) };
      const patch: Record<string, number | string> = {};
      // a line's bends go with it
      if ((s.kind === 'line' || s.kind === 'arrow') && s.bends) patch.bends = bendText(bendPoints(s.bends).map(([u, v]): Pt => [mx(u, dx), my(v, dy)]));
      const noX = s.kind === 'yband' || s.kind === 'hline';
      const noY = s.kind === 'xband' || s.kind === 'vline';
      const one = s.kind === 'vline' || s.kind === 'hline' || s.kind === 'scalebar';
      if (!noX) patch.x1 = mx(s.x1, dx);
      if (!noY) patch.y1 = my(s.y1, dy);
      if (!noX && !one) patch.x2 = mx(s.x2, dx);
      if (!noY && !one) patch.y2 = my(s.y2, dy);
      return patch;
    };
    // a range of x (a Histogram's, a quick fit's): as on the graph of a Fit, its edges dragged (over the frame's height)
    if (s.kind === 'xband' && (a.owner?.field === 'ranges' || a.owner?.field === 'qfit'))
      return (
        <g>
          <ShapeView s={s} m={m} defaults={defaults} id={`${idPrefix}-${a.key}`.replace(/[^\w-]/g, '_')} />
          <RangeEdges s={s} m={m} info={info} />
        </g>
      );
    const sid = `${idPrefix}-${a.key}`.replace(/[^\w-]/g, '_');
    const body = (
      <g data-body="">
        <Effects id={`${sid}-fx`} box={m.box} blur={s.blur} shadow={shadowOf(s)}>
          <ShapeView s={s} m={m} defaults={defaults} id={sid} />
        </Effects>
      </g>
    );
    if (a.locked) return body;
    return (
      <Draggable info={info(apply)}>
        {body}
        <ShapeHandles s={s} m={m} info={info} item={a.owner?.field === 'annotations' ? a.owner.item : undefined} />
        <GradHandles s={s} m={m} info={info} />
      </Draggable>
    );
  }
  if (a.kind === 'text') {
    const s = a.text;
    const body = (
      <g data-body="">
        <Effects id={`${idPrefix}-${a.key}-fx`.replace(/[^\w-]/g, '_')} box={m.box} blur={s.blur} shadow={s.textShadow ? { dx: s.shadowX ?? 1, dy: s.shadowY ?? 1, blur: s.shadowBlur ?? 1, color: s.shadowColor || '#000000', opacity: s.shadowOpacity ?? 0.4 } : null}>
          <TextView s={s} m={m} defaults={defaults} id={`${idPrefix}-${a.key}`.replace(/[^\w-]/g, '_')} />
        </Effects>
      </g>
    );
    if (a.locked) return body;
    return (
      <Draggable
        info={info((dx, dy) => {
          const { mx, my } = moved(m, s.coords);
          return { x: mx(s.x, dx), y: my(s.y, dy) };
        })}
      >
        {body}
        <TextHandles s={s} m={m} defaults={defaults} info={info} />
      </Draggable>
    );
  }
  const b = a.bar;
  return (
    <Draggable info={info((dx, dy) => ({ x: r1(b.x + (dx / m.box.w) * 100), y: r1(b.y + (dy / m.box.h) * 100) }))}>
      <ColorbarView bar={b} curve={a.curve} m={m} defaults={defaults} gid={`${idPrefix}-cb-${a.key.replace(/[^\w-]/g, '_')}`} />
      <BarHandle b={b} m={m} info={info} />
    </Draggable>
  );
}

// An annotation as a part a click finds: an item of a node's annotations, or a quick fit's range (its curve)
function PartOf({ a, children }: { a: Annotation; children: ReactNode }) {
  const o = a.owner;
  const part = o?.field === 'annotations' ? `ann:${o.item}` : o?.field === 'qfit' ? `curve:${o.node}:${o.curve}` : o?.field === 'ranges' ? 'frame' : undefined;
  return part ? (
    <g data-part={part} data-node={o!.node}>
      {children}
    </g>
  ) : (
    <>{children}</>
  );
}

// The layer of a legend or annotation: below 0 under the data, higher numbers over lower ones.
const zOf = (a: Annotation) => (a.kind === 'shape' ? a.shape.z : a.kind === 'text' ? a.text.z : a.bar.z) ?? 1;
type Item = { z: number; key: string; el: ReactNode };
const byZ = (items: Item[], below: boolean) =>
  items
    .filter((i) => (i.z < 0) === below)
    .sort((a, b) => a.z - b.z)
    .map((i) => <Fragment key={i.key}>{i.el}</Fragment>);

// ---- one side of the frame ----
function SideView({ axis, frame, defaults, node }: { axis: DrawnAxis; frame: Box; defaults: TextDefaults; node?: string }) {
  const { side, s, pos, f: t, title } = axis;
  const horiz = side === 'bottom' || side === 'top';
  const out = side === 'bottom' || side === 'right' ? 1 : -1; // away from the frame
  const edge = side === 'bottom' ? frame.y + frame.h + s.offset : side === 'top' ? frame.y - s.offset : side === 'left' ? frame.x - s.offset : frame.x + frame.w + s.offset;
  // crossing the frame at a value of the other axis: the line, ticks and numbers there
  const line = axis.cross ?? edge;
  const inLen = (l: number) => (s.ticks === 'in' || s.ticks === 'both' ? l : 0);
  const outLen = (l: number) => (s.ticks === 'out' || s.ticks === 'both' ? l : 0);
  // all the tick marks of a kind in one path
  const marks = (vals: number[], len: number) => {
    const a = line - out * inLen(len);
    const b = line + out * outLen(len);
    return vals.map((v) => (horiz ? `M${n2(t(v))},${n2(a)}V${n2(b)}` : `M${n2(a)},${n2(t(v))}H${n2(b)}`)).join('');
  };
  const lt = resolveText(s.labelText, defaults);
  const tt = resolveText(s.titleText, defaults);
  let shown = pos.major.map((v, k) => ({ v, label: pos.labels[k] ?? '' }));
  if (s.hideFirst) shown = shown.slice(1);
  if (s.hideLast) shown = shown.slice(0, -1);
  const labelPos = line + out * ((s.ticks === 'none' ? 0 : outLen(s.tickLen)) + s.labelGap);
  const rot = s.rotation % 360;
  // how far the labels reach away from the axis
  const reach = labelReach(axis, defaults);
  // the title past the numbers — for an axis crossing the frame: at the frame's edge, or past its numbers when they go
  // beyond it
  const far = s.labels ? labelPos + out * reach : line;
  const titlePos = axis.cross !== undefined ? (out > 0 ? Math.max(edge, far) : Math.min(edge, far)) + out * s.titleGap : labelPos + out * (reach + s.titleGap);
  const ends = horiz ? [frame.x, frame.x + frame.w] : [frame.y, frame.y + frame.h];
  return (
    <g>
      {s.line && <path d={axisLine(horiz, line, ends, pos.gaps ?? [])} stroke={s.color} strokeWidth={s.lineWidth} strokeLinecap="butt" fill="none" />}
      {s.ticks !== 'none' && (
        <path d={marks(pos.major, s.tickLen) + (s.minorTicks ? marks(pos.minor, s.minorLen) : '')} stroke={s.color} strokeWidth={s.tickWidth} fill="none" />
      )}
      {s.labels &&
        shown.map(({ v, label }, k) => {
          const p = t(v);
          if (!label) return null;
          // turned, a label of several lines (wrapped) hangs away from the axis; of one line, centred on its tick
          const many = label.includes('\\\\');
          if (side === 'bottom') return <RichText key={k} x={p} y={labelPos} text={label} st={lt} anchor={rot ? (rot > 0 ? 'start' : 'end') : 'middle'} valign={rot ? (many ? 'top' : 'middle') : 'top'} rotate={rot} num />;
          if (side === 'top') return <RichText key={k} x={p} y={labelPos} text={label} st={lt} anchor={rot ? (rot > 0 ? 'end' : 'start') : 'middle'} valign={rot ? (many ? 'bottom' : 'middle') : 'bottom'} rotate={rot} num />;
          if (side === 'left') return <RichText key={k} x={labelPos} y={p} text={label} st={lt} anchor="end" valign="middle" rotate={rot} num />;
          return <RichText key={k} x={labelPos} y={p} text={label} st={lt} anchor="start" valign="middle" rotate={rot} num />;
        })}
      {s.labels && pos.common && (horiz ? <RichText x={frame.x + frame.w + 3} y={labelPos} text={pos.common} st={lt} valign={side === 'bottom' ? 'top' : 'bottom'} num /> : <RichText x={line} y={frame.y - 3} text={pos.common} st={lt} anchor={side === 'left' ? 'start' : 'end'} valign="bottom" num />)}
      {s.showTitle && title && <AxisTitle axis={axis} frame={frame} titlePos={titlePos} out={out} tt={tt} node={node} />}
    </g>
  );
}

// The title of an axis: at the start, the middle, the end of the axis or at a place along it (% of its length), its gap
// from the numbers; dragged on the figure it goes where it is dropped (along: the place, across: the gap).
function AxisTitle({ axis, frame, titlePos, out, tt, node }: { axis: DrawnAxis; frame: Box; titlePos: number; out: number; tt: ReturnType<typeof resolveText>; node?: string }) {
  const { side, s, title } = axis;
  const horiz = side === 'bottom' || side === 'top';
  const len = horiz ? frame.w : frame.h;
  // the place along the axis (pt) and the anchor of the text
  const at = s.titleAlign === 'start' ? 0 : s.titleAlign === 'end' ? 100 : s.titleAlign === 'custom' && Number.isFinite(s.titleAt) ? s.titleAt : 50;
  const p = horiz ? frame.x + (at / 100) * len : frame.y + frame.h - (at / 100) * len;
  const edge = s.titleAlign === 'start' ? 'start' : s.titleAlign === 'end' ? 'end' : 'middle';
  // a rotated title (right axis: +90°) runs downward: its start is at the top
  const anchor = edge === 'middle' ? 'middle' : side === 'right' ? (edge === 'start' ? 'end' : 'start') : edge;
  // turned by hand: centred on its place, as far out as its turned extent needs
  const turned = Number.isFinite(s.titleRotation) ? s.titleRotation! : null;
  const mid = turned === null ? 0 : (() => {
    const m = richMetrics(title, tt);
    return turnedExtent(m.width, m.lines * m.lineHeight, turned, horiz) / 2;
  })();
  const el =
    turned !== null ? (
      horiz ? (
        <RichText x={p} y={titlePos + out * mid} text={title} st={tt} anchor="middle" valign="middle" rotate={turned} />
      ) : (
        <RichText x={titlePos + out * mid} y={p} text={title} st={tt} anchor="middle" valign="middle" rotate={turned} />
      )
    ) : horiz ? (
      <RichText x={p} y={titlePos} text={title} st={tt} anchor={anchor} valign={side === 'bottom' ? 'top' : 'bottom'} />
    ) : (
      <RichText x={titlePos} y={p} text={title} st={tt} anchor={anchor} valign="bottom" rotate={side === 'left' ? -90 : 90} />
    );
  if (!node) return el;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const info: DragInfo = {
    node,
    apply: (dx, dy, data) => {
      const st = axesStyle(data.axes as Partial<AxesStyle> | undefined);
      const along = horiz ? dx : -dy;
      const across = horiz ? dy : dx;
      const patch = { titleAlign: 'custom' as const, titleAt: r1(Math.min(100, Math.max(0, at + (along / len) * 100))), titleGap: r1(s.titleGap + out * across) };
      const key = axis.key;
      if (key === 'bottom' || key === 'left' || key === 'top' || key === 'right') return { axes: { ...st, sides: { ...st.sides, [key]: { ...st.sides[key], ...patch } } } };
      return { axes: { ...st, extra: st.extra.map((e) => (e.id === key ? { ...e, style: { ...e.style, ...patch } } : e)) } };
    },
  };
  return <Draggable info={info}>{el}</Draggable>;
}

// The line of an axis from end to end, interrupted at its breaks, with two slanted strokes at each side of a break.
function axisLine(horiz: boolean, at: number, ends: number[], gaps: [number, number][]): string {
  const P = (u: number, v: number) => (horiz ? `${n2(u)},${n2(v)}` : `${n2(v)},${n2(u)}`);
  const [e0, e1] = [Math.min(ends[0], ends[1]), Math.max(ends[0], ends[1])];
  const cuts = [...gaps].sort((p, q) => p[0] - q[0]);
  let d = '';
  let from = e0;
  for (const [g0, g1] of cuts) {
    d += `M${P(from, at)}L${P(g0, at)}`;
    from = g1;
  }
  d += `M${P(from, at)}L${P(e1, at)}`;
  // the break marks: // across the axis
  for (const [g0, g1] of cuts) for (const g of [g0, g1]) d += `M${P(g - 1.5, at + 3)}L${P(g + 1.5, at - 3)}`;
  return d;
}

// An object cut to an outline (clip) or seen through a shape's lightness (mask).
function Clipped({ a, m, defaults, id, children }: { a: Annotation; m: Mapper; defaults: TextDefaults; id: string; children: ReactNode }) {
  let out = <>{children}</>;
  if (a.clip) {
    const d = pathText(mapSegs(parsePath(a.clip), ([u, v]): Pt => [m.x(u), m.y(v)]));
    out = (
      <g clipPath={`url(#${id}-clip)`}>
        <defs>
          <clipPath id={`${id}-clip`}>
            <path d={d} />
          </clipPath>
        </defs>
        {out}
      </g>
    );
  }
  if (a.mask) {
    const b = m.box;
    out = (
      <g mask={`url(#${id}-mask)`}>
        <defs>
          <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={n2(b.x - b.w)} y={n2(b.y - b.h)} width={n2(b.w * 3)} height={n2(b.h * 3)}>
            <ShapeView s={a.mask} m={m} defaults={defaults} id={`${id}-mk`} />
          </mask>
        </defs>
        {out}
      </g>
    );
  }
  return out;
}

// A Figure Drawing in its place (its page fitted in the frame and centred, scaled as a whole: lines and texts too),
// cut at the edges of its page. Its objects in mm from the page's top-left corner.
const MM = 72 / 25.4;
const drawingMapper = (w: number, h: number): Mapper => ({ x: (v) => v * MM, y: (v) => v * MM, ix: (p) => p / MM, iy: (p) => p / MM, box: { x: 0, y: 0, w, h } });
function DrawingPanel({ ax, W, H, idPrefix, defaults }: { ax: AxesFig; W: number; H: number; idPrefix: string; defaults: TextDefaults }) {
  const st = ax.style;
  const frame: Box = { x: (st.pos.x / 100) * W, y: (st.pos.y / 100) * H, w: Math.max(1, (st.pos.w / 100) * W), h: Math.max(1, (st.pos.h / 100) * H) };
  const { w, h } = ax.drawing!;
  const k = w > 0 && h > 0 ? Math.min(frame.w / w, frame.h / h) : 1;
  const [ox, oy] = [frame.x + (frame.w - w * k) / 2, frame.y + (frame.h - h * k) / 2];
  const m = drawingMapper(w, h);
  const same = Math.abs(k - 1) < 1e-9 && Math.abs(ox) < 1e-6 && Math.abs(oy) < 1e-6;
  const clipId = `${idPrefix}-dclip`;
  const node = ax.node ?? ax.key;
  const items = ax.annotations.map((a): Item => {
    const el = (
      <Clipped a={a} m={m} defaults={defaults} id={`${idPrefix}-${a.key}`.replace(/[^\w-]/g, '_')}>
        <PartOf a={a}>
          <AnnotationView a={a} m={m} defaults={defaults} idPrefix={idPrefix} />
        </PartOf>
      </Clipped>
    );
    // pinned to the data under it: moved with them (its points kept as drawn: its handles still change them)
    return { z: zOf(a), key: `a${a.key}`, el: a.shift ? <g transform={`translate(${n2(m.x(a.shift[0]) - m.x(0))} ${n2(m.y(a.shift[1]) - m.y(0))})`}>{el}</g> : el };
  });
  return (
    <g data-part="frame" data-node={node}>
      <g transform={same ? undefined : `translate(${n2(ox)} ${n2(oy)}) scale(${+k.toFixed(6)})`}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={n2(w)} height={n2(h)} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <DragScale.Provider value={k}>
            {byZ(items, true)}
            {byZ(items, false)}
          </DragScale.Provider>
        </g>
      </g>
    </g>
  );
}

// beneath: what is drawn in its frame under its curves (the objects of a drawing behind the data)
function AxesView({ ax, W, H, idPrefix, defaults: pageDefaults, beneath }: { ax: AxesFig; W: number; H: number; idPrefix: string; defaults: TextDefaults; beneath?: ReactNode }) {
  if (ax.drawing) return <DrawingPanel ax={ax} W={W} H={H} idPrefix={idPrefix} defaults={ax.text ?? pageDefaults} />;
  return <AxesFrameView ax={ax} W={W} H={H} idPrefix={idPrefix} defaults={pageDefaults} beneath={beneath} />;
}
function AxesFrameView({ ax, W, H, idPrefix, defaults: pageDefaults, beneath }: { ax: AxesFig; W: number; H: number; idPrefix: string; defaults: TextDefaults; beneath?: ReactNode }) {
  const defaults = ax.text ?? pageDefaults;
  const st = ax.style;
  const frame: Box = { x: (st.pos.x / 100) * W, y: (st.pos.y / 100) * H, w: Math.max(1, (st.pos.w / 100) * W), h: Math.max(1, (st.pos.h / 100) * H) };
  const { scales, sBottom, sLeft, tb, tl, xOf, yOf, drawn } = axesGeometry(ax, frame, defaults);
  const mapper: Mapper = { x: sBottom.f, y: sLeft.f, ix: sBottom.inv, iy: sLeft.inv, box: frame };
  // its legends and annotations, each on its layer
  const items: Item[] = [
    ...ax.annotations.map((a): Item => ({ z: zOf(a), key: `a${a.key}`, el: <PartOf a={a}><AnnotationView a={a} m={mapper} defaults={defaults} idPrefix={idPrefix} /></PartOf> })),
    // labels at the curves' right ends, outside the frame
    ...endLabels(ax, frame, defaults, axisNeeds(ax, frame, defaults)).map((e, k): Item => ({ z: 2.5, key: `end${k}`, el: <RichText x={e.x} y={e.y} text={e.text} st={e.st} valign="middle" num /> })),
    ...ax.legends.map((lg): Item => {
      // outside the frame: past the numbers and title of that side
      const out = (lg.curves.length > 0 || !!lg.title) && legendPlace(lg, frame, defaults).side;
      const place = out ? legendPlace(lg, frame, defaults, axisNeeds(ax, frame, defaults)) : undefined;
      return {
        z: lg.z ?? 3,
        key: `l${lg.key}`,
        el: (
          <g data-part="legend" data-node={lg.owner?.node}>
            <LegendBox lg={lg} box={frame} defaults={defaults} {...(place ? { place } : {})} />
          </g>
        ),
      };
    }),
  ];
  const clipId = `${idPrefix}-clip`;
  const gridLines = (g: AxesFig['style']['grid']['x'], vals: number[], minor: number[], f: (v: number) => number, vertical: boolean) => {
    if (!g.major && !g.minor) return null;
    // all the lines of a grid in one path
    const d = (vs: number[]) => vs.map((v) => (vertical ? `M${n2(f(v))},${n2(frame.y)}V${n2(frame.y + frame.h)}` : `M${n2(frame.x)},${n2(f(v))}H${n2(frame.x + frame.w)}`)).join('');
    return (
      <g strokeOpacity={g.opacity} fill="none">
        {g.minor && <path d={d(minor)} stroke={g.minorColor} strokeWidth={g.width * 0.7} strokeDasharray={dashArray(g.dash, g.width)} />}
        {g.major && <path d={d(vals)} stroke={g.color} strokeWidth={g.width} strokeDasharray={dashArray(g.dash, g.width)} />}
      </g>
    );
  };
  const scalesOf = (c: Curve) => [scales.get(xOf(c))! as Scale, scales.get(yOf(c))! as Scale] as const;
  // the parts a click on the figure finds (data-part, data-node: what is opened): the frame, each curve, axis, legend,
  // annotation
  const node = ax.node ?? ax.key;
  return (
    <g data-part="frame" data-node={node}>
      <defs>
        <clipPath id={clipId}>
          <rect x={n2(frame.x)} y={n2(frame.y)} width={n2(frame.w)} height={n2(frame.h)} />
        </clipPath>
      </defs>
      {st.background && <rect x={n2(frame.x)} y={n2(frame.y)} width={n2(frame.w)} height={n2(frame.h)} fill={st.background} />}
      {gridLines(st.grid.x, tb.major, tb.minor, sBottom.f, true)}
      {gridLines(st.grid.y, tl.major, tl.minor, sLeft.f, false)}
      {beneath}
      {byZ(items, true)}
      <g clipPath={st.clip ? `url(#${clipId})` : undefined}>
        {ax.curves.map((c, k) => {
          const [sx, sy] = scalesOf(c);
          return (
            <Dim key={`u${k}|${c.key}`} curve={c.key}>
              <g data-part={`curve:${c.key}`}>
                <CurveView c={c} sx={sx} sy={sy} frame={frame} defaults={defaults} below others={ax.curves} />
              </g>
            </Dim>
          );
        })}
        {ax.curves.map((c, k) => {
          const [sx, sy] = scalesOf(c);
          return (
            <Dim key={`c${k}|${c.key}`} curve={c.key}>
              <g data-part={`curve:${c.key}`}>
                <CurveView c={c} sx={sx} sy={sy} frame={frame} defaults={defaults} below={false} gid={idPrefix} />
              </g>
            </Dim>
          );
        })}
      </g>
      {drawn.map((a) => (
        <g key={a.key} data-part={`axis:${a.key}`}>
          <SideView axis={a} frame={frame} defaults={defaults} node={node} />
        </g>
      ))}
      {byZ(items, false)}
    </g>
  );
}

// ---- “Edit layout” (Merge): the frames move and resize with the mouse, the panel grid's margins and gaps too ----
const ACCENT = '#14b8a6';
const HANDLES: [number, number, string][] = [
  [-1, -1, 'nwse-resize'],
  [0, -1, 'ns-resize'],
  [1, -1, 'nesw-resize'],
  [1, 0, 'ew-resize'],
  [1, 1, 'nwse-resize'],
  [0, 1, 'ns-resize'],
  [-1, 1, 'nesw-resize'],
  [-1, 0, 'ew-resize'],
];
const half = (v: number) => Math.round(v * 2) / 2;
// a value near an edge of another frame goes onto it, else onto the 0.5 % steps
function snapTo(v: number, edges: number[]): number {
  let best = v;
  let gap = 0.8;
  for (const e of edges)
    if (Math.abs(e - v) < gap) {
      gap = Math.abs(e - v);
      best = e;
    }
  return best === v ? half(v) : +best.toFixed(2);
}

// A box moved and resized with the mouse: the frame of a Plot (its place on its page), or a Plot in a Merge (its box).
// place: the node's data changed for the new box (% of the page).
function PanelFrame({ p, others, W, H, node, place }: { p: Placement; others: Placement[]; W: number; H: number; node: string; place: (data: Record<string, unknown>, pos: Placement) => Record<string, unknown> }) {
  const f: Box = { x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H };
  const xs = [0, 100, ...others.flatMap((o) => [o.x, o.x + o.w])];
  const ys = [0, 100, ...others.flatMap((o) => [o.y, o.y + o.h])];
  // the box when a handle (hx, hy: -1 left / top, 1 right / bottom, 0 not that way) is moved by dx, dy pt
  const resized = (hx: number, hy: number, dx: number, dy: number, keep: boolean): Placement => {
    const [ddx, ddy] = [(dx / W) * 100, (dy / H) * 100];
    let { x, y, w, h } = p;
    if (hx < 0) [x, w] = [x + ddx, w - ddx];
    else if (hx > 0) w += ddx;
    if (hy < 0) [y, h] = [y + ddy, h - ddy];
    else if (hy > 0) h += ddy;
    if (keep && hx && hy) {
      // Shift: the shape of the box kept (its width decides)
      const nh = (w * p.h) / p.w;
      if (hy < 0) y += h - nh;
      h = nh;
    }
    return { x, y, w: Math.max(2, w), h: Math.max(2, h) };
  };
  const asTransform = (q: Placement) => {
    const [sx, sy] = [(q.w / 100) * W / f.w, (q.h / 100) * H / f.h];
    return `translate(${n2((q.x / 100) * W)} ${n2((q.y / 100) * H)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${n2(-f.x)} ${n2(-f.y)})`;
  };
  const move: DragInfo = {
    node,
    root: true,
    apply: (dx, dy, data) => {
      const [x, y] = [p.x + (dx / W) * 100, p.y + (dy / H) * 100];
      // the left or the right edge onto another box's edge, whichever is nearer
      const sx = [snapTo(x, xs) - x, snapTo(x + p.w, xs) - x - p.w].sort((a, b) => Math.abs(a) - Math.abs(b))[0];
      const sy = [snapTo(y, ys) - y, snapTo(y + p.h, ys) - y - p.h].sort((a, b) => Math.abs(a) - Math.abs(b))[0];
      return place(data, { ...p, x: +(x + sx).toFixed(2), y: +(y + sy).toFixed(2) });
    },
  };
  const size = (hx: number, hy: number): DragInfo => ({
    node,
    root: true,
    transform: (dx, dy, keep) => asTransform(resized(hx, hy, dx, dy, keep)),
    apply: (dx, dy, data, keep) => {
      const q = resized(hx, hy, dx, dy, keep);
      // the edges moved go onto the edges of the other boxes, or the 0.5 % steps
      let { x, y, w, h } = q;
      if (hx < 0) [x, w] = [snapTo(x, xs), x + w - snapTo(x, xs)];
      if (hx > 0) w = snapTo(x + w, xs) - x;
      if (!keep || !hx || !hy) {
        if (hy < 0) [y, h] = [snapTo(y, ys), y + h - snapTo(y, ys)];
        if (hy > 0) h = snapTo(y + h, ys) - y;
      }
      return place(data, { x: +x.toFixed(2), y: +y.toFixed(2), w: +Math.max(2, w).toFixed(2), h: +Math.max(2, h).toFixed(2) });
    },
  });
  const s = 5;
  return (
    <g data-drag-root>
      <Draggable info={move}>
        <rect x={n2(f.x)} y={n2(f.y)} width={n2(f.w)} height={n2(f.h)} fill={ACCENT} fillOpacity={0.06} stroke={ACCENT} strokeWidth={1} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" style={{ cursor: 'move' }} />
      </Draggable>
      {HANDLES.map(([hx, hy, cursor]) => (
        <Draggable key={`${hx}${hy}`} info={size(hx, hy)}>
          <rect x={n2(f.x + ((hx + 1) / 2) * f.w - s / 2)} y={n2(f.y + ((hy + 1) / 2) * f.h - s / 2)} width={s} height={s} fill="#ffffff" stroke={ACCENT} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor }} />
        </Draggable>
      ))}
    </g>
  );
}

// “Edit layout”: on a Plot its frame (then placed by hand: Page ▸ Frame), in a Merge the box of every Plot (then out of
// the grid, an inset; Merge ▸ Back to the grid).
function LayoutOverlay({ fig, W, H }: { fig: Figure; W: number; H: number }) {
  const on = useContext(Interactive);
  const edit = useContext(LayoutEdit);
  if (!on || !edit || !fig.key) return null;
  const node = fig.key;
  if (fig.boxes) {
    const boxes: FigureBox[] = fig.boxes;
    return (
      <g data-export="skip">
        {boxes.map((b, k) => (
          <PanelFrame
            key={b.key + k}
            p={b.box}
            others={boxes.filter((_, j) => j !== k).map((o) => o.box)}
            W={W}
            H={H}
            node={node}
            place={(data, pos) => {
              // the box moved gets its own place; the others still in the grid keep theirs (placed by hand where they
              // are now), else they would fill the cells it leaves and run under it
              const items = (data.items as CanvasItem[] | undefined) ?? [];
              const now = (key: string, it?: CanvasItem): CanvasItem => {
                const nb = boxes.find((o) => o.key === key);
                return key === b.key ? { ...it, key, free: pos } : it?.free || !nb ? (it ?? { key }) : { ...it, key, free: nb.box };
              };
              const known = new Set(items.map((it) => it.key));
              return { items: [...items.map((it) => now(it.key, it)), ...boxes.filter((o) => !known.has(o.key) && !o.key.includes('#')).map((o) => now(o.key))] };
            }}
          />
        ))}
      </g>
    );
  }
  const ax = fig.axes[0];
  if (!ax) return null;
  return (
    <g data-export="skip">
      <PanelFrame p={ax.style.pos} others={[]} W={W} H={H} node={ax.node ?? node} place={(data, pos) => ({ axes: { ...(data.axes as object), pos }, page: { ...(data.page as object), frame: 'manual' } })} />
      {fig.axes.map((a) => {
        const ins = a.inset;
        const host = ins && fig.axes.find((h) => h.key === ins.host);
        if (!ins?.box || !host || !a.node) return null;
        const hp = host.style.pos;
        return (
          <PanelFrame
            key={`inset-${a.key}`}
            p={ins.box}
            others={[hp]}
            W={W}
            H={H}
            node={ins.owner}
            place={(data, pos) => {
              const list = (data.insets as InsetItem[] | undefined) ?? [];
              const at = { x: +(((pos.x - hp.x) / hp.w) * 100).toFixed(2), y: +(((pos.y - hp.y) / hp.h) * 100).toFixed(2), w: +((pos.w / hp.w) * 100).toFixed(2), h: +((pos.h / hp.h) * 100).toFixed(2) };
              const own = list.find((it) => it.key === a.node);
              return { insets: own ? list.map((it) => (it.key === a.node ? { ...it, ...at } : it)) : [...list, { ...INSET_DEFAULTS, key: a.node!, ...at }] };
            }}
          />
        );
      })}
    </g>
  );
}

const PANEL_LABELS: Record<Exclude<PanelScheme, 'none'>, (k: number) => string> = {
  a: (k) => String.fromCharCode(97 + k),
  '(a)': (k) => `(${String.fromCharCode(97 + k)})`,
  'a)': (k) => `${String.fromCharCode(97 + k)})`,
  A: (k) => String.fromCharCode(65 + k),
  '(A)': (k) => `(${String.fromCharCode(65 + k)})`,
  'A)': (k) => `${String.fromCharCode(65 + k)})`,
};

// The order the axes are drawn in: those of the Plots placed by hand in a Merge (and their insets) after the others
function drawOrder(fig: Figure): number[] {
  const free = (ax: AxesFig): boolean => {
    if (ax.inset) {
      const host = fig.axes.find((a) => a.key === ax.inset!.host);
      return !!host && host !== ax && free(host);
    }
    return !!fig.boxes?.find((b) => b.key === ax.node)?.free;
  };
  const rank = fig.axes.map((ax) => (fig.boxes ? +free(ax) : 0));
  return fig.axes.map((_, k) => k).sort((a, b) => rank[a] - rank[b] || a - b);
}

// Under an inset: on its host, the region it shows (zoom: its X and Y ranges as a rectangle) joined to the inset's
// frame by two lines, from the corners that face each other; then the inset's background over its box.
function InsetUnder({ ax, host, W, H, defaults }: { ax: AxesFig; host: AxesFig | undefined; W: number; H: number; defaults: TextDefaults }) {
  const ins = ax.inset!;
  const pt = (p: Placement) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H, w: (p.w / 100) * W, h: (p.h / 100) * H });
  const box = ins.box ? pt(ins.box) : null;
  const F = pt(ax.style.pos);
  let marks: ReactNode = null;
  if (ins.zoom && host) {
    const hf = pt(host.style.pos);
    const gh = axesGeometry(host, hf, host.text ?? defaults);
    const gi = axesGeometry(ax, F, ax.text ?? defaults);
    const xs = [gh.sBottom.f(gi.sBottom.lo), gh.sBottom.f(gi.sBottom.hi)];
    const ys = [gh.sLeft.f(gi.sLeft.lo), gh.sLeft.f(gi.sLeft.hi)];
    const R = { x: minOf(xs), y: minOf(ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) };
    if ([R.x, R.y, R.w, R.h].every(Number.isFinite)) {
      const [rc, fc] = [{ x: R.x + R.w / 2, y: R.y + R.h / 2 }, { x: F.x + F.w / 2, y: F.y + F.h / 2 }];
      const [dx, dy] = [fc.x - rc.x, fc.y - rc.y];
      const c = (b: Box, sx: 0 | 1, sy: 0 | 1) => ({ x: b.x + sx * b.w, y: b.y + sy * b.h });
      // the inset mostly beside the region: its near side's corners; mostly above / below: the facing corners
      const pairs: [{ x: number; y: number }, { x: number; y: number }][] =
        Math.abs(dx) * (R.h + F.h) >= Math.abs(dy) * (R.w + F.w)
          ? dx > 0
            ? [[c(R, 1, 0), c(F, 0, 0)], [c(R, 1, 1), c(F, 0, 1)]]
            : [[c(R, 0, 0), c(F, 1, 0)], [c(R, 0, 1), c(F, 1, 1)]]
          : dy > 0
            ? [[c(R, 0, 1), c(F, 0, 0)], [c(R, 1, 1), c(F, 1, 0)]]
            : [[c(R, 0, 0), c(F, 0, 1)], [c(R, 1, 0), c(F, 1, 1)]];
      const l = ins.line;
      const stroke = { stroke: l.color, strokeWidth: l.width, strokeDasharray: dashArray(l.dash, l.width), strokeOpacity: l.opacity < 1 ? l.opacity : undefined };
      marks = (
        <g>
          <rect x={n2(R.x)} y={n2(R.y)} width={n2(R.w)} height={n2(R.h)} fill="none" {...stroke} strokeDasharray={undefined} />
          {pairs.map(([a, b], k) => (
            <line key={k} x1={n2(a.x)} y1={n2(a.y)} x2={n2(b.x)} y2={n2(b.y)} {...stroke} />
          ))}
        </g>
      );
    }
  }
  return (
    <>
      {marks}
      {box && ins.background && ins.background !== 'none' && <rect x={n2(box.x)} y={n2(box.y)} width={n2(box.w)} height={n2(box.h)} fill={ins.background} />}
    </>
  );
}

// A border inside the box x, y, w, h (pt): `inset` in from its edge, the line wholly inside.
function BorderRect({ x, y, w, h, b }: { x: number; y: number; w: number; h: number; b: PageBorder }) {
  const o = b.inset + b.width / 2;
  const [bw, bh] = [w - 2 * o, h - 2 * o];
  if (!(b.width > 0) || bw <= 0 || bh <= 0) return null;
  return <rect x={n2(x + o)} y={n2(y + o)} width={n2(bw)} height={n2(bh)} rx={b.radius ? n2(Math.min(b.radius, bw / 2, bh / 2)) : undefined} fill="none" stroke={b.color} strokeWidth={b.width} strokeDasharray={dashArray(b.dash, b.width)} strokeOpacity={b.opacity < 1 ? b.opacity : undefined} />;
}

// The whole figure: width / height in its unit, drawn in points. `display` sets the on-screen size in px (the
// export replaces it with the physical size).
// `crop` (pt): show only that part of the page.
function FigureSvgView({ fig, display, idPrefix, crop }: { fig: Figure; display: { width: number; height: number }; idPrefix: string; crop?: Box }) {
  const W = toPt(fig.width, fig.unit);
  const H = toPt(fig.height, fig.unit);
  const vb = crop ?? { x: 0, y: 0, w: W, h: H };
  const page: Mapper = { x: (v) => (v / 100) * W, y: (v) => (v / 100) * H, ix: (p) => (p / W) * 100, iy: (p) => (p / H) * 100, box: { x: 0, y: 0, w: W, h: H } };
  const d = fig.text;
  const panelT = resolveText({ bold: true, size: d.size + 2, ...fig.panelText }, d);
  const items: Item[] = [
    ...fig.annotations.map((a): Item => ({ z: zOf(a), key: `a${a.key}`, el: <PartOf a={a}><AnnotationView a={a} m={page} defaults={d} idPrefix={idPrefix} /></PartOf> })),
    ...fig.legends.map((lg): Item => ({ z: lg.z ?? 3, key: `l${lg.key}`, el: <g data-part="legend" data-node={lg.owner?.node}><LegendBox lg={lg} box={page.box} defaults={d} /></g> })),
  ];
  return (
    <CommaContext.Provider value={!!fig.comma}>
    <svg xmlns="http://www.w3.org/2000/svg" width={display.width} height={display.height} viewBox={`${vb.x.toFixed(3)} ${vb.y.toFixed(3)} ${vb.w.toFixed(3)} ${vb.h.toFixed(3)}`} fontFamily={d.font} data-physical={`${fig.width}${fig.unit}x${fig.height}${fig.unit}`}>
      {fig.background !== 'none' && <rect width={W} height={H} fill={fig.background || '#ffffff'} />}
      {byZ(items, true)}
      {drawOrder(fig).map((k) => {
        const ax = fig.axes[k];
        // drawn inside the frame of its host, not here
        if (ax.beneath && fig.axes.some((a) => a.key === ax.beneath)) return null;
        const under = fig.axes.map((u, j) => (u.beneath === ax.key ? <DrawingPanel key={`b${j}`} ax={u} W={W} H={H} idPrefix={`${idPrefix}-a${j}`} defaults={u.text ?? d} /> : null)).filter(Boolean);
        // a Plot placed by hand in a Merge: over the others, on its page's ground
        const bx = !ax.inset && fig.boxes?.find((b) => b.key === ax.node);
        const ground = bx && bx.background && fig.axes.findIndex((a) => !a.inset && a.node === ax.node) === k ? bx : null;
        return (
          <Fragment key={ax.key + k}>
            {ground && <rect x={n2((ground.box.x / 100) * W)} y={n2((ground.box.y / 100) * H)} width={n2((ground.box.w / 100) * W)} height={n2((ground.box.h / 100) * H)} fill={ground.background} />}
            {ax.inset && <InsetUnder ax={ax} host={fig.axes.find((a) => a.key === ax.inset!.host)} W={W} H={H} defaults={d} />}
            <AxesView ax={ax} W={W} H={H} idPrefix={`${idPrefix}-a${k}`} defaults={d} beneath={under.length ? under : undefined} />
          </Fragment>
        );
      })}
      {fig.panels !== 'none' &&
        fig.axes.map((ax, k) => {
          // the panels counted without the insets and the drawings over them
          if (ax.inset || ax.overlay) return null;
          const n = fig.axes.slice(0, k).filter((a) => !a.inset && !a.overlay).length;
          const lab = ax.style.panelLabel === '-' ? '' : ax.style.panelLabel || PANEL_LABELS[fig.panels as Exclude<PanelScheme, 'none'>](n);
          if (!lab) return null;
          // at the corner of the Plot's box in a Merge (else of the frame)
          const p = fig.boxes?.find((b) => b.key === ax.node)?.box ?? ax.style.pos;
          const [lx, ly] = [(p.x / 100) * W + fig.panelX, (p.y / 100) * H + fig.panelY];
          const mt = fig.panelBox ? richMetrics(lab, panelT) : null;
          return (
            <Fragment key={`p${k}`}>
              {mt && <rect x={n2(lx - 1.5)} y={n2(ly - 1)} width={n2(mt.width + 3)} height={n2(mt.lines * mt.lineHeight + 1)} fill={fig.panelBox} />}
              <RichText x={lx} y={ly} text={lab} st={panelT} valign="top" />
            </Fragment>
          );
        })}
      {byZ(items, false)}
      {fig.boxes?.map((b) => b.border && <BorderRect key={`b${b.key}`} x={(b.box.x / 100) * W} y={(b.box.y / 100) * H} w={(b.box.w / 100) * W} h={(b.box.h / 100) * H} b={b.border} />)}
      {fig.border > 0 && <BorderRect x={0} y={0} w={W} h={H} b={{ width: fig.border, color: fig.borderColor, dash: fig.borderDash ?? 'solid', radius: fig.borderRadius ?? 0, opacity: fig.borderOpacity ?? 1, inset: fig.borderInset ?? 0 }} />}
      <LayoutOverlay fig={fig} W={W} H={H} />
    </svg>
    </CommaContext.Provider>
  );
}

// Redrawn only when the figure (the same object while nothing in it changed), its size on screen or its crop change.
export const FigureSvg = memo(
  FigureSvgView,
  (a, b) => a.fig === b.fig && a.display.width === b.display.width && a.display.height === b.display.height && a.idPrefix === b.idPrefix && JSON.stringify(a.crop) === JSON.stringify(b.crop),
);
