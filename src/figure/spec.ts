// What a figure is made of, procedurally: a 1D plot is a whole figure — its page (physical size), one frame of axes
// with its curves (data + style), its legend and annotations; a Merge puts several of them on one page (a grid of
// cells) with annotations of its own. All lengths of the drawing are in points (1 pt = 1/72 in), so a figure of 85 mm
// exports at exactly that size.
//
// Stored node data hold partial styles (older projects lack the newer fields): the full style is always the defaults
// merged with what is stored (curveStyle, axesStyle, … below).
import type { Column, Series } from '../engine/table.ts';
import type { Elbow, StickSide } from './shapes.ts';
import type { MathFontChoice } from '../math/sizes.ts';

// ---- text ----
// An empty field = the canvas default (font, size, bold, italic, colour of the whole figure).
export type TextStyle = { font?: string; size?: number; bold?: boolean; italic?: boolean; color?: string };
// mathFont: the font of the formulas ($…$), the page's choice (absent: chosen from the text's font)
export type TextDefaults = { font: string; size: number; bold: boolean; italic: boolean; color: string; mathFont?: MathFontChoice };
export type ResolvedText = TextDefaults;
export const resolveText = (s: TextStyle | undefined, d: TextDefaults): ResolvedText => ({
  font: s?.font || d.font,
  size: s?.size && s.size > 0 ? s.size : d.size,
  bold: s?.bold ?? d.bold,
  italic: s?.italic ?? d.italic,
  color: s?.color || d.color,
  ...(d.mathFont && { mathFont: d.mathFont }),
});

// ---- curves ----
export type PlotMode = 'line' | 'scatter' | 'linesymbol' | 'step';
export type SymbolShape = 'circle' | 'square' | 'triangle' | 'triangleDown' | 'triangleLeft' | 'triangleRight' | 'diamond' | 'pentagon' | 'hexagon' | 'cross' | 'plus' | 'star';
export type Dash = 'solid' | 'dash' | 'dot' | 'dashdot' | 'longdash' | 'shortdash' | 'dashdotdot';
export type SymbolFill = 'filled' | 'open' | 'white' | 'dot';
export type ColorMapName = 'viridis' | 'plasma' | 'inferno' | 'magma' | 'cividis' | 'turbo' | 'coolwarm' | 'rdbu' | 'gray' | 'custom';
export type ColorBy = 'none' | 'index' | 'x' | 'y' | 'column';

export type CurveStyle = {
  show: boolean; // false: not drawn, not in the legend, not in the limits of the axes (still a line to fill to)
  mode: PlotMode;
  color: string;
  lineWidth: number; // pt
  dash: Dash;
  connect: 'straight' | 'spline'; // spline: a smooth curve through the points (monotone where x is ordered)
  stepKind: 'hv' | 'vh' | 'mid';
  lineOpacity: number; // 0 … 1
  symbol: SymbolShape;
  symbolSize: number; // pt, the width of the symbol
  symbolFill: SymbolFill; // open: no fill; white: filled with white (hides the line behind it); dot: open with a dot
  symbolEdge: number; // pt, outline of the symbol
  edgeColor: string; // '' = the colour of the curve
  symbolOpacity: number;
  every: number; // a symbol on every N-th point
  drop: 'none' | 'vertical' | 'horizontal'; // lines from each point to the axis
  // the area under the curve: down to y = 0, the bottom of the frame, a line y = f(x) (fillFormula: a number or a formula
  // of x), another curve of the Plot (fillCurve: its number, 1 …), or straight lines through points (fillPoints:
  // “x, y; x, y …”)
  fill: 'none' | 'zero' | 'bottom' | 'formula' | 'curve' | 'points';
  fillFormula: string;
  fillCurve: number;
  fillPoints: string;
  fillColor: string; // '' = the colour of the curve
  fillOpacity: number;
  errWidth: number; // pt, error bars
  errCap: number; // pt, width of the caps (0 = none)
  errStyle: 'bars' | 'band'; // bars, or a shaded band y ± error
  errDir: 'both' | 'plus' | 'minus';
  errColor: string; // '' = the colour of the curve
  errOpacity: number;
  errFrom: 'column' | 'value' | 'percent'; // ±Y: the ±Y column, the same value for every point, or a % of |y|
  errValue: number;
  errAsym: boolean; // a separate column for the − error (port “−Y”); ±Y is then the + error
  errCapWidth: number; // pt, the line of the caps (NaN = as the bar)
  errDash: Dash;
  errEvery: number; // a bar on every N-th point
  errGap: boolean; // the bar stops at the edge of the symbol
  errAbove: boolean; // the bars over the symbols (else under them)
  errBandEdge: number; // pt, lines along the edges of the band (0 = none)
  errX: ErrXStyle; // the X error bars: as the Y ones, or their own look
  masked: 'faded' | 'hidden'; // points masked by Data manipulation: grey, or not drawn (the line goes on past them)
  // colour from the data: the row number, x, y, or a column on the colour port
  colorBy: ColorBy;
  cmap: ColorMapName;
  cmapColors: string[]; // the custom map: 2 or 3 colours
  cmapMin: number; // NaN = the data
  cmapMax: number;
  cmapReverse: boolean;
  cmapLog: boolean;
  categorical: boolean; // integer / text values → one palette colour each
  colorTarget: 'both' | 'symbols' | 'line';
  // symbol size from the data: the row number, x, y, or a column on the size port — from sizeMin to sizeMax pt over the
  // values sizeFrom … sizeTo (absent / NaN: the data; outside: the nearest end), on a log scale, reversed, the area (not
  // the width) in proportion; sizeKey: a few sizes with their values in the legend
  sizeBy: 'none' | 'index' | 'x' | 'y' | 'column';
  sizeMin: number; // pt
  sizeMax: number;
  sizeFrom?: number;
  sizeTo?: number;
  sizeLog?: boolean;
  sizeReverse?: boolean;
  sizeArea?: boolean;
  sizeKey?: boolean;
  // the line's width from the data (the same sources; a column: the size port), widthMin … widthMax pt
  widthBy?: 'none' | 'index' | 'x' | 'y' | 'column';
  widthMin?: number;
  widthMax?: number;
  // line + symbols: the line over the symbols (else under them); stopped symbolGap pt before the edge of every symbol
  lineOver?: boolean;
  symbolGap?: number;
  labels: 'none' | 'y' | 'x' | 'column'; // a label at each point
  // …Left: ending at the point (the end of a line); …Right: starting at it (its start); center: on it (a matrix's cells)
  labelPos: 'above' | 'below' | 'left' | 'right' | 'aboveLeft' | 'belowLeft' | 'aboveRight' | 'belowRight' | 'center';
  labelDigits: number;
  labelText: TextStyle;
  // which axes scale the curve: X1 bottom, X2 top, X3 … extra; Y1 left, Y2 right, Y3 … extra (an axis the Axes does
  // not have, or a top / right axis without its own scale: the bottom / left one)
  axisX: string;
  axisY: string;
  // the line: its ends and corners, a halo (a band of haloColor around it, `halo` pt each side: it reads over other
  // curves), heads at the curve's start / end
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  halo?: number;
  haloColor?: string;
  arrowStart?: ArrowHead;
  arrowEnd?: ArrowHead;
  arrowSize?: number;
  // the fill drawn with its own line (over the curves drawn before it — a waterfall's hidden lines), not under all lines
  fillOver?: boolean;
  // the fill under the curve hatched (over its colour)
  fillHatch?: Hatch;
  fillHatchColor?: string;
  fillHatchLook?: HatchLook;
  // its label written at its end, outside the frame at the right, in its colour (lines labelled directly; the labels
  // kept apart)
  endLabel?: boolean;
  // a rug: a short tick at every x value along the bottom of the frame (x), or every y value along its left (y); length pt
  rug?: 'x' | 'y';
  rugLength?: number;
};
export type ErrXStyle = { same: boolean; width: number; cap: number; color: string; dash: Dash; dir: 'both' | 'plus' | 'minus' };
// A curve as drawn: its data, style, and the per-point values that colour / size / label it.
export type Curve = {
  key: string;
  label: string;
  series: Series;
  style: CurveStyle;
  colorValues?: ArrayLike<number>; // colorBy ≠ none
  colorText?: string[]; // categorical text column
  colorRange?: [number, number]; // the range of the map, resolved (for the colour bar)
  sizeValues?: ArrayLike<number>;
  sizeRange?: [number, number];
  widthValues?: ArrayLike<number>; // widthBy ≠ none
  widthRange?: [number, number];
  keyEntry?: boolean; // an entry of a legend's size key (a symbol of one size and its value)
  labelValues?: Column;
  mask?: Uint8Array; // its masked points (from its X or Y column)
  // one of the curves a Plot curve was split into (a sweep): `base` the key of that Plot curve
  group?: CurveGroup;
  // in a legend: all the curves of a split shown as one entry (a colour scale, or the line with the range)
  groupSpan?: { lo: number; hi: number; count: number };
  noLegend?: boolean; // drawn, not listed in the legend (the values over a bar chart's bars)
  // the slices of a pie / doughnut (Pie chart): drawn in the frame itself (no axes), its centre at the frame's centre
  wedges?: Wedges;
  // a ternary chart (Ternary): its series as fractions a, b, c, its grid; drawn in the frame itself
  ternary?: { series: TernarySeries[]; step: number; percent: boolean; names: [string, string, string] };
  // a polar / radar chart (Polar / radar): its series in θ (degrees) and r, its grid; drawn in the frame itself
  polar?: PolarFrame;
  // a 3D scene (3D plot): surfaces, bars, lines and points in data units, the box and its axes, the view; drawn in the
  // frame itself (projected, the nearest drawn last)
  three?: ThreeScene;
  // Z on a grid (Contour / heatmap): the cells coloured by the curve's colour map over `range` (filled: by the band
  // between two levels), sharp or smooth; NaN cells in `nan` ('' = not drawn); cut: only the values between these two
  // drawn (the others as NaN; tested after the smooth interpolation)
  grid?: { xs: number[]; ys: number[]; z: Float64Array; mode: 'heat' | 'filled'; smooth: boolean; levels: number[]; range: [number, number]; nan: string; cut?: [number, number] };
  // boxes and violins (Box & violin): every one at its place across, its parts along the values
  boxes?: { items: BoxItem[]; horizontal?: boolean; look?: Partial<BarLook>; median: { color: string; width: number } };
  // bars (a histogram, a bar chart): every bar from lo to hi across, from base up to y (horizontal: lo … hi along Y,
  // base … value along X — the value in series.x); drawn filled (bars), as the outline of the steps (step) or the steps
  // filled (stepfilled); their look (hatching …), a colour each, error bars, the values written
  bars?: {
    lo: ArrayLike<number>;
    hi: ArrayLike<number>;
    base: ArrayLike<number>;
    look: 'bars' | 'step' | 'stepfilled';
    horizontal?: boolean;
    style?: Partial<BarLook>;
    colors?: string[];
    colors2?: string[]; // a gradient: from the bar's colour at its end to this one at its base ('' = none)
    looks?: (ElementLook | null)[]; // a look of its own for any bar (bars coloured by category)
    err?: { plus: ArrayLike<number>; minus: ArrayLike<number>; cap: number; width: number; color: string };
    labels?: { text: string[]; pos: 'top' | 'inside' | 'center'; style: TextStyle };
  };
};
// A box / violin as drawn: its place across, half its width, a whole or half violin (towards the smaller or larger
// places), its colour; the box (quartiles, whiskers, notch, its own half width and place), the mean, the outliers, the
// violin (half widths along the values), the quartile lines inside it; its extent along the values.
export type BoxItem = {
  pos: number;
  half: number;
  side: 'both' | 'low' | 'high';
  fill: string;
  fill2?: string; // a gradient: from fill at the end of the values to this one at the base
  box?: { q1: number; med: number; q3: number; wlo: number; whi: number; half: number; notch?: [number, number]; at: number };
  mean?: number;
  outliers?: number[];
  violin?: { at: number[]; w: number[] };
  quartiles?: [number, number, number];
  vlo: number;
  vhi: number;
  look?: ElementLook; // its own edge, opacity, hatching, median (a group coloured by category)
};
// A pie: its slices (angles in degrees counterclockwise from 3 o'clock, radii as parts of the pie's radius), the radius
// as a part of half the frame's smaller side, the labels (inside, or outside with a leader line), a text in the centre.
// label: inside the slice (or outside when `outside`); outer: a second label outside (the name out, the percent in)
export type WedgeItem = { a0: number; a1: number; r0: number; r1: number; fill: string; explode: number; look?: ElementLook; label?: string; outside?: boolean; outer?: string };
// at: the centre's place across the frame (0 … 1; 0.5 the middle)
export type Wedges = { items: WedgeItem[]; size: number; at?: number; center?: string[]; labelStyle?: TextStyle; centerStyle?: TextStyle };
// A polar chart: every series (θ in degrees, r; its look), the range of r (lo at the centre), the circles of r, where 0° is
// and the direction, the sector shown, the spokes (every thetaStep degrees, or a radar's categories), the labels.
export type PolarSeries = { name: string; theta: number[]; r: number[]; color: string; mode: 'line' | 'scatter' | 'linesymbol' | 'bars'; fill: boolean; opacity: number; close: boolean; lineWidth: number; dash: Dash; showLine: boolean; symbol: SymbolShape; symbolSize: number; symbolFill: SymbolFill; showPoints: boolean; barWidth: number };
// colors: a colour every point (coloured by a column), else color
export type TernarySeries = { name: string; a: number[]; b: number[]; c: number[]; color: string; mode: 'scatter' | 'line' | 'linesymbol'; lineWidth: number; dash: Dash; showLine: boolean; symbol: SymbolShape; symbolSize: number; symbolFill: SymbolFill; showPoints: boolean; colors?: string[] };
export type PolarFrame = { series: PolarSeries[]; lo: number; hi: number; rTicks: number[]; zero: 'E' | 'N'; clockwise: boolean; sector: [number, number]; thetaStep: number; thetaLabels: 'deg' | 'compass' | 'rad' | 'none'; rLabelAngle: number; gridShape: 'circle' | 'polygon'; spokes?: string[] };
// The look of bars beyond their colour: a hatching (its lines' direction, colour, spacing and width), the edge's line,
// rounded corners, a gradient (the colour fading towards the base), a shadow.
// lines (/ \ | - + x), marks (dots, dots in staggered rows, rings, squares, small x), bricks, a zigzag, waves, a
// checkerboard, or a text of one's own (letters, signs, emoji: at most 5 characters)
export type Hatch = 'none' | '/' | '\\' | '|' | '-' | '+' | 'x' | '.' | 'o' | 'dots2' | 'squares' | 'xs' | 'brick' | 'zigzag' | 'wave' | 'checker' | 'text';
// A hatching beyond its kind and colour (absent: as before): the distance between its lines / marks (pt), the width of
// its lines (pt), the size of its marks or text (pt), turned by an angle (degrees), its opacity, a background under it,
// its text, the marks in staggered rows.
export type HatchLook = { spacing?: number; width?: number; size?: number; angle?: number; opacity?: number; bg?: string; text?: string; stagger?: boolean };
// gradient: from gradTop at the value's end to gradBase at the base ('' = the bar's colour, and a lighter one of it)
export type BarLook = { hatch: Hatch; hatchColor: string; hatchSpacing: number; hatchWidth: number; hatchLook?: HatchLook; edgeDash: Dash; radius: number; gradient: boolean; gradTop: string; gradBase: string; shadow: boolean };
export const BAR_LOOK_DEFAULTS: BarLook = { hatch: 'none', hatchColor: '', hatchSpacing: 4, hatchWidth: 0.6, edgeDash: 'solid', radius: 0, gradient: false, gradTop: '', gradBase: '', shadow: false };
// The look of one element of a chart (a group, a series, a category) beyond its colour: what it changes of the node's
// own settings (absent = the node's). Bars, boxes, violins: opacity, edge, hatching, the median, the error bars; points:
// symbol, size, fill; lines: the reference line and the band (Probability plot), every fit of a column (Histogram).
export type LineLook = { color?: string; width?: number; dash?: Dash; show?: boolean };
export type ElementLook = {
  opacity?: number;
  edgeColor?: string;
  edgeWidth?: number;
  hatch?: Hatch;
  hatchColor?: string;
  median?: string;
  err?: string;
  points?: boolean;
  symbol?: SymbolShape;
  symbolSize?: number;
  symbolFill?: SymbolFill;
  line?: LineLook;
  band?: LineLook;
  fits?: (LineLook | null)[];
  explode?: number; // a pie's slice moved out, % of the radius
};
// a curve of bars / boxes with an element's look: its style and its bar look
export function withLook(style: CurveStyle, look: Partial<BarLook> | undefined, L: ElementLook | null | undefined): { style: CurveStyle; look: Partial<BarLook> | undefined } {
  if (!L) return { style, look };
  return {
    style: { ...style, ...(L.opacity !== undefined ? { fillOpacity: L.opacity } : {}), ...(L.edgeColor ? { edgeColor: L.edgeColor } : {}), ...(L.edgeWidth !== undefined ? { lineWidth: L.edgeWidth } : {}) },
    look: L.hatch !== undefined || L.hatchColor ? { ...look, ...(L.hatch !== undefined ? { hatch: L.hatch } : {}), ...(L.hatchColor ? { hatchColor: L.hatchColor } : {}) } : look,
  };
}
export type CurveGroup = { base: string; index: number; count: number; value: number; name: string; range: [number, number]; color: 'map' | 'palette' | 'same' };

// ---- 3D ----
export type P3 = [number, number, number];
// a surface on a grid: Z at every (xs[i], ys[j]) (z[j·nx + i]), a fill colour per cell ('' = none: a wireframe), the
// mesh lines every `every` cells (0: none)
// mesh: every so many cells, along X only, Y only (dir) or both; one colour, a colour at every node (colors: by Z) or a
// darker one of the cell's (darker); its opacity, its dashes. back: the colour of the underside ('' the same); light: its
// direction (azimuth, elevation, degrees; absent: from the eye's side); shine: a highlight (0 … 1)
export type ThreeSurface = { xs: number[]; ys: number[]; z: Float64Array; fill: string[]; opacity: number; shade: number; mesh: { every: number; color: string; width: number; dir?: 'x' | 'y'; colors?: string[]; darker?: boolean; opacity?: number; dash?: Dash }; back?: string; light?: [number, number]; shine?: number };
export type ThreeBar = { x: number; y: number; z0: number; z1: number; dx: number; dy: number; color: string };
// a line through points (planar: in one plane — a curve of a 3D waterfall —, sorted as a whole); fill: down to the floor
// bias: drawn so much nearer than it is (contour lines on a surface: over its cells); a marked line's heads at its two
// ends (their size, pt), its opacity, a closed one's fill (area), its projections on the floor and the back walls
export type Head3D = 'none' | 'arrow' | 'open' | 'bar';
export type ThreeLine = { pts: P3[]; color: string; width: number; dash: Dash; planar: boolean; fill?: { color: string; opacity: number }; bias?: number; heads?: [Head3D, Head3D]; headSize?: number; opacity?: number; area?: { color: string; opacity: number }; proj?: { floor?: boolean; x?: boolean; y?: boolean } };
export type ThreePoints = { pts: P3[]; colors: string[]; symbol: SymbolShape; size: number; fill: SymbolFill; edge: number; drop: boolean; depthShade: boolean };
// a flat map at a height z (a layer of 3D stacked maps): cells between the edges xe (nx + 1) and ye (ny + 1), a value
// each (v[j·nx + i], NaN: empty), coloured when drawn by the curve's colour map over its colour range (so a Merge can
// give its panels one scale); its opacity
export type ThreePlane = { name: string; z: number; xe: number[]; ye: number[]; v: Float64Array; opacity: number };
export type ThreeScene = {
  node?: string; // the node that drew it (turned with the mouse)
  range: { x: [number, number]; y: [number, number]; z: [number, number] };
  azim: number; // degrees, from +X towards +Y
  elev: number; // degrees above the XY plane
  persp: number; // 0: orthographic; else the eye's distance (box half-sizes)
  aspect: P3; // the box's sides (the longest = 1)
  titles: [string, string, string];
  ticks: number; // about this many values an axis
  panes: string; // the back walls' colour ('' = none)
  grid: string; // their grid's colour ('' = none)
  edges: 'back' | 'all' | 'none';
  edgeColor: string;
  surfaces: ThreeSurface[];
  bars: { items: ThreeBar[]; edge: string; edgeWidth: number; opacity: number };
  lines: ThreeLine[];
  points: ThreePoints[];
  // the floor (z = the lowest): a map of a surface's Z (cells and their colours) or its contour lines
  floor?: { cells?: { x0: number; x1: number; y0: number; y1: number; color: string }[]; lines?: { pts: [number, number][]; color: string }[] };
  // the same on the ceiling (z = the highest); the surfaces projected on the back walls — their curves every so many
  // rows (lines) or their highest outline filled (max) —; the opacity of every projection
  ceiling?: { cells?: { x0: number; x1: number; y0: number; y1: number; color: string }[]; lines?: { pts: [number, number][]; color: string }[] };
  walls?: { mode: 'lines' | 'max'; every: number; color: string };
  projOpacity?: number;
  // texts in the box (the labels of the marks): where, what, their colour and size (0: the figure's)
  labels?: { at: P3; text: string; color: string; size: number }[];
  // stacked maps: the layers, and the values outside the colour range hidden (else drawn in its end colours)
  planes?: ThreePlane[];
  outside?: 'clamp' | 'hide';
  // the Z axis: these values with these texts (the layers' names or places) instead of nice ones; none: no numbers
  zLabels?: { at: number[]; text: string[] };
  yLabels?: { at: number[]; text: string[] }; // the depth of a waterfall: its curves' own labels
  // the walls with the grid: the one across X, across Y, across Z (the floor) — absent: all; minor: dashed lines halfway
  gridWalls?: [boolean, boolean, boolean];
  gridMinor?: boolean;
  // the camera: zoomed k times (1: the box fitted in the frame), its middle moved by dx, dy (parts of the frame's width
  // and height)
  cam?: ThreeCam;
};
export type ThreeCam = { k: number; dx: number; dy: number };

// ---- axes ----
export type AxisRange = 'nice' | 'padded' | 'tight';
// symlog: logarithmic on both sides of 0, linear near it (within ±linthresh); logit: ln(v / (1 − v)), values in 0 … 1
export type ScaleType = 'linear' | 'log' | 'reciprocal' | 'probability' | 'symlog' | 'logit';
// A probability axis (values in %, 0 < v < 100): placed by the quantile of a distribution, so that its cumulative
// probability is a straight line — normal (Φ⁻¹), logistic (logit), smallest extreme value (Weibull: ln(−ln(1 − p))),
// largest extreme value (Gumbel: −ln(−ln p)), exponential (−ln(1 − p)).
export type ProbAxis = 'normal' | 'logistic' | 'sev' | 'lev' | 'exp';
// The scale of an axis.
export type AxisSpec = {
  title: string; // (older projects: the title, now in the side's style)
  min: number; // NaN = automatic
  max: number;
  range: AxisRange; // automatic limits: rounded out to the ticks, the data ± 5 %, or the data exactly
  scale: ScaleType;
  step: number; // major tick step (linear), NaN = automatic
  count: number; // number of major ticks wanted when there is no step (automatic: about 5)
  minor: number; // minor ticks between two majors
  reverse: boolean;
  custom: string; // ticks at chosen values, with labels: "400, 532 = green, 633" (empty = the regular ticks)
  // how the major ticks are placed (absent in older projects: from step / count / custom): automatic, every `step`
  // (from `first` when set: 10, 15, 20 …), `count` ticks evenly over the range, or at the `custom` values
  ticksBy?: 'auto' | 'increment' | 'count' | 'values';
  first?: number; // the first major tick (increment), NaN = multiples of the step
  labelEvery?: number; // a label on every N-th major tick (1 = all)
  breaks?: string; // parts of the axis left out: "20-80; 120-150" (linear and log axes)
  breakGap?: number; // the gap drawn at a break, % of the axis length
  prob?: ProbAxis; // the distribution of a probability axis (normal when absent)
  base?: 10 | 2 | 'e'; // a log axis: the powers of this base at the ticks (10 when absent)
  linthresh?: number; // symlog: the part near 0 that is linear, ±linthresh (1 when absent)
  // what its values are (a 1D plot): numbers; categories — texts (or numbers taken as names) at 1, 2, 3 …, in the order
  // of the data, sorted, or as listed (catList: “B, A, C”), spread by ±jitter around their place (scatter); dates and
  // times (or durations, h:mm:ss) — their numbers in seconds, the ticks in calendar steps, written as timeFormat (empty:
  // automatic; yyyy, MMM, MM, dd, HH, mm, ss …), dates with slashes read day / month or month / day; auto: categories
  // for a column of text, times when every text is a date or a time
  kind?: 'auto' | 'number' | 'category' | 'time';
  catOrder?: 'data' | 'sorted' | 'custom';
  catList?: string;
  jitter?: number;
  timeFormat?: string;
  dateOrder?: 'dmy' | 'mdy';
  // found when the figure is made (not kept): the names of the categories at 1, 2, 3 …; the values are times
  cats?: string[];
  time?: 'date' | 'duration';
};
export type TickDir = 'in' | 'out' | 'both' | 'none';
export type LabelFormat = 'auto' | 'decimal' | 'sci' | 'eng' | 'common' | 'percent' | 'si';
export type Side = 'bottom' | 'left' | 'top' | 'right';
// How one side of the frame looks.
export type SideStyle = {
  line: boolean;
  ticks: TickDir;
  minorTicks: boolean;
  labels: boolean;
  showTitle: boolean;
  color: string; // line, ticks
  lineWidth: number; // pt
  tickWidth: number; // pt
  tickLen: number; // pt
  minorLen: number;
  offset: number; // pt: the axis moved away from the frame
  // the axis drawn where the other axis has this value (bottom, top: a Y; left, right: an X) — its line, ticks and
  // numbers there, its title at the frame's edge; absent: at the frame's edge (axes through the origin: 0 and 0)
  cross?: number;
  title: string; // '' = from the data (the column's name)
  titleText: TextStyle;
  titleGap: number; // pt between the tick labels and the title
  // where along the axis: at its start (left / bottom), its middle, its end (right / top), or at titleAt % of its length
  titleAlign: 'start' | 'center' | 'end' | 'custom';
  titleAt: number;
  labelText: TextStyle;
  format: LabelFormat;
  decimals: number; // NaN = automatic
  prefix: string;
  suffix: string;
  factor: number; // labels divided by this factor
  rotation: number; // degrees
  wrap?: number; // the labels broken into lines of about this many characters (at their spaces); 0 / absent: not
  titleRotation?: number; // degrees; absent: along the axis (bottom / top 0, left −90, right 90)
  labelGap: number; // pt between the ticks and the labels
  plus: boolean; // + before positive labels
  hideFirst: boolean;
  hideLast: boolean;
  // its line, ticks, numbers and title in the colour of the first curve on it (several Y axes: which is whose)
  curveColor?: boolean;
};
// The top / right axes: a mirror of the opposite one, an own scale (curves choose it), or a function of the opposite
// one (e.g. eV over nm: 1239.84/x).
export type SecondAxis = { mode: 'mirror' | 'own' | 'function'; scale: AxisSpec; fn: string };
export type GridStyle = { major: boolean; minor: boolean; color: string; width: number; dash: Dash; opacity: number; minorColor: string };
// Placement in the canvas: % of the canvas width / height, measured from its top-left corner (the frame of the axes;
// the tick labels and titles lie outside it).
export type Placement = { x: number; y: number; w: number; h: number };
export type AxesStyle = {
  x: AxisSpec; // the bottom axis' scale
  y: AxisSpec; // the left axis' scale
  top: SecondAxis;
  right: SecondAxis;
  sides: Record<Side, SideStyle>;
  grid: { x: GridStyle; y: GridStyle };
  background: string; // '' = none
  clip: boolean; // curves cut at the frame
  pos: Placement;
  panelLabel: string; // '' = automatic (Merge), '-' = none, else the text
  extra: ExtraAxis[]; // more axes: a third Y, a second X on top … each with its own scale, moved out by `style.offset`
  free?: boolean; // kept out of the Merge's panel grid (moved by hand): placed by `pos`
  // a fixed aspect: the length of 1 unit of Y = aspect × the length of 1 unit of X (1: equal;
  // absent / 0: the frame as large as fits); the frame is made narrower or lower to keep it
  aspect?: number;
};
// An extra axis (X3, Y3 …): on a side of the frame, its own scale and look; curves choose it by its id.
export type ExtraAxis = { id: string; side: Side; scale: AxisSpec; style: SideStyle };
export const axisKind = (side: Side) => (side === 'left' || side === 'right' ? 'y' : 'x');

// ---- legends, annotations ----
export type Anchor = 'tl' | 'tc' | 'tr' | 'cl' | 'c' | 'cr' | 'bl' | 'bc' | 'br';
// z: the layer of a legend or annotation — below 0 under the data, the data at 0, higher numbers over lower ones;
// attach: (older projects) the Axes node it was on.
export type Placed = { attach: string; z: number };
// The node a legend or annotation is kept in (dragging it on the figure changes it there): a Plot's legend, an item of
// the annotations of a Plot or a Merge.
// ranges: a fit range of a Histogram (its number), shown as a band: dragged, its ends change (x1 → lo, x2 → hi)
// qfit: a range of a Plot's quick fit (curve, fit, range: their numbers), shown as a band, dragged in the same way
export type Owner = { node: string; field: 'legend' } | { node: string; field: 'annotations'; item: string } | { node: string; field: 'ranges'; item: number } | { node: string; field: 'qfit'; curve: number; fit: number; item: number };
// An entry of a legend: its curve (key), shown or not, its own text ('' = the curve's legend text).
export type LegendEntry = { key: string; show: boolean; label: string };
export type LegendSpec = Placed & {
  key: string;
  owner?: Owner;
  curves: Curve[];
  x: number; // % of its container (frame of the axes, or the canvas)
  y: number;
  anchor: Anchor; // which point of the legend box is at x, y
  arrange: 'column' | 'row' | 'grid'; // one column, all on one row, or `columns` columns
  fill: 'down' | 'across'; // in a grid: the entries go down the columns first, or across the rows
  entries: LegendEntry[]; // the order, visibility and texts chosen (curves not listed follow, in their order)
  // a curve split into several (a sweep): one entry each, one entry with its colour scale / range, or `auto` (one
  // entry each up to 8, else one)
  groups?: 'auto' | 'each' | 'one';
  columns: number;
  reverse: boolean;
  title: string;
  text: TextStyle;
  frame: 'none' | 'line' | 'shadow' | 'round';
  frameColor: string;
  frameWidth: number;
  frameDash?: Dash;
  radius?: number; // pt, the corners (rounded frame: 4 when not given)
  frameOpacity?: number;
  background: string; // '' = none
  bgOpacity: number;
  padding: number; // pt
  spacing: number; // line spacing, × font size
  lineLen: number; // pt, the sample line
  auto?: boolean; // placed by itself inside the frame where it covers the least of the data (x, y, anchor found)
};
export type ShapeKind = 'line' | 'arrow' | 'rect' | 'ellipse' | 'polygon' | 'xband' | 'yband' | 'vline' | 'hline' | 'bracket' | 'star' | 'regular' | 'arc' | 'callout' | 'scalebar' | 'dimension' | 'path' | 'image' | 'component';
// the body of a line or arrow: one line, two, tapered, a wave, a zigzag, a chemical equilibrium ⇌ (even, or favouring
// the right / the left), a retrosynthetic arrow ⇒
export type ArrowBody = 'single' | 'double' | 'tapered' | 'wavy' | 'zigzag' | 'equilibrium' | 'eqRight' | 'eqLeft' | 'retro';
export type ArrowHead = 'none' | 'triangle' | 'open' | 'stealth' | 'bar' | 'circle' | 'diamond' | 'square' | 'half';
export type Coords = 'data' | 'percent'; // the units of the data (inside an Axes), or % of the container
export type ShapeSpec = Placed & {
  kind: ShapeKind;
  coords: Coords;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: string; // polygon: "x y; x y; …"
  color: string;
  width: number;
  dash: Dash;
  opacity: number;
  fill: string; // '' = none
  fillOpacity: number;
  head1: ArrowHead; // at the start
  head2: ArrowHead; // at the end
  headSize: number; // pt
  radius: number; // rounded corners, pt
  radii?: string; // a rectangle: a radius for each corner, pt (top-left, top-right, bottom-right, bottom-left)
  // a polygon, star, regular polygon or path: its corners rounded, pt — "* r" every one, "i r" the node i (the end of the
  // i-th piece of its outline as a path; 0: its first point); kept apart from its points, so they can be changed again
  corners?: string;
  rotation: number; // degrees
  below: boolean; // (older projects) under the curves: now z < 0
  text: string; // bracket: the text over it (e.g. ***)
  textStyle: TextStyle;
  // polygon: closed (a shape) or open (a polyline: its ends can have heads, head1 / head2); straight or smooth through
  // the points; how the lines meet; a hatching over the fill
  closed?: boolean;
  smooth?: boolean;
  join?: 'miter' | 'round' | 'bevel';
  hatch?: Hatch;
  hatchColor?: string;
  hatchLook?: HatchLook;
  // the ends of its lines; a shadow under it; the fill a gradient to fill2 (linear at gradAngle degrees, or radial)
  cap?: 'butt' | 'round' | 'square';
  shadow?: boolean;
  grad?: 'none' | 'linear' | 'radial';
  fill2?: string;
  gradAngle?: number;
  // the gradient placed in the shape's box (src/figure/gradient.ts): linear from (gradX1, gradY1) to (gradX2, gradY2),
  // radial from (gradCx, gradCy) out to radii gradR across and gradR2 down — in % of the box (the radii of its half
  // width and half height); beyond its ends padded, reflected or repeated; the second colour's opacity
  gradX1?: number;
  gradY1?: number;
  gradX2?: number;
  gradY2?: number;
  gradCx?: number;
  gradCy?: number;
  gradR?: number;
  gradR2?: number;
  gradSpread?: 'pad' | 'reflect' | 'repeat';
  fill2Opacity?: number;
  // the line's own dashes (pt: dash gap dash gap …, instead of `dash`), how far a sharp corner may reach (× the width);
  // a soft shadow (blurred: shadowBlur pt, moved by shadowX, shadowY pt, its colour and opacity — on any shape) and a
  // blur of the whole shape (pt)
  dashPattern?: string;
  miter?: number;
  shadowX?: number;
  shadowY?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  blur?: number;
  // line, arrow: bent (the middle pushed aside by curve × its length, − the other side); or through bends — points
  // between its ends, "x y; x y …" in its units (a smooth curve through them all; curve then not used)
  curve?: number;
  bends?: string;
  // line, arrow: its route — the line (straight, bent or through bends) or an elbow (hv: across then down, vh, hvh, vhv;
  // its middle piece at elbowAt of the way; corners rounded by `radius` pt); its body (two lines gap pt apart, tapered
  // from width2 pt at the start to `width` at its end, a wave or zigzag amp pt either side and wave pt long, an
  // equilibrium of two harpoons gap pt apart, a retrosynthetic ⇒); crossed out (✕ in its middle: no reaction); texts
  // above (text) and below (text2) it at labelAt of the way (textStyle, textGap pt away, along it or level: textDir)
  route?: 'line' | Elbow;
  elbowAt?: number;
  body?: ArrowBody;
  gap?: number;
  width2?: number;
  amp?: number;
  wave?: number;
  cross?: boolean;
  text2?: string;
  labelAt?: number;
  // dimension: the length from (x1, y1) to (x2, y2), on a line `offset` pt aside between two extension lines, written
  // with dec decimals and its unit (or `text`)
  offset?: number;
  dec?: number;
  unit?: string;
  // a Figure Drawing's line stuck to shapes (their ids) at its start / end: on their outline (auto: facing the other
  // end), or the middle of a side, or the centre; `away` pt off it
  from?: string;
  to?: string;
  fromAt?: StickSide;
  toAt?: StickSide;
  away?: number;
  // path: its outline (SVG path text in its units: M, L, C, Z — any SVG path read in), filled even-odd or not
  d?: string;
  evenodd?: boolean;
  // image: a picture (a data URL: PNG, JPEG, SVG …) in the box (x1, y1)–(x2, y2), its proportions kept (fit) or not
  href?: string;
  stretch?: boolean;
  // component: an instance of a Figure Drawing's component (its id) placed in the box (x1, y1)–(x2, y2)
  ref?: string;
  // bracket: over (legs down) or under (legs up) a range of x at y1, left / right of a range of y at x1, or free from
  // (x1, y1) to (x2, y2) (its legs on the side flip chooses); square ⊓, a curly brace or a bar |—|; the legs headSize
  // and leg2 pt; its text beyond it, textGap pt away, along it, level, or at textAngle degrees
  orient?: 'down' | 'up' | 'left' | 'right' | 'free';
  flip?: boolean;
  bstyle?: 'square' | 'curly' | 'bar';
  leg2?: number;
  textGap?: number;
  textDir?: 'along' | 'level' | 'angle';
  textAngle?: number;
  // star, regular polygon: in the box (x1, y1)–(x2, y2), n points / sides (the star's inner points at inner × its size)
  n?: number;
  inner?: number;
  // arc: of the ellipse in the box, from a1 to a2 degrees (0: to the right, counter-clockwise); sector: closed to the centre
  a1?: number;
  a2?: number;
  sector?: boolean;
  // callout: its text in a box at (x1, y1) (pad pt around it), a line to the point (x2, y2) with head2 there
  pad?: number;
  // scale bar: from (x1, y1), len in the units of the data along x (vertical: along y), its text (empty: the length)
  len?: number;
  vertical?: boolean;
};
export type TextSpec = Placed & {
  text: string;
  coords: Coords;
  x: number;
  y: number;
  anchor: Anchor;
  rotation: number;
  style: TextStyle;
  box: 'none' | 'fill' | 'border' | 'both';
  boxColor: string;
  borderColor: string;
  borderWidth: number;
  padding: number;
  boxOpacity?: number;
  borderDash?: Dash;
  borderOpacity?: number;
  radius?: number; // pt, the corners of the box
  shadow?: boolean;
  numbers?: boolean; // written by a node (its numbers follow the figure's decimal comma), not typed
  blur?: number; // pt, the whole text (and its box) blurred
  // its lines aligned in their box (else as its anchor: its left, middle or right); justify: every line but the last as
  // wide as the longest
  align?: 'left' | 'center' | 'right' | 'justify';
  // a soft shadow of its letters: moved shadowX, shadowY pt, blurred shadowBlur pt, its colour and opacity
  textShadow?: boolean;
  shadowX?: number;
  shadowY?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  // along the outline of another object of a Figure Drawing (its id), from pathAt (0 – 1) of its length; pathD: that
  // outline (in its units), found when the drawing is made
  onPath?: string;
  pathAt?: number;
  pathD?: string;
  // on the other side of that outline (its direction turned round), so many pt away from it
  pathFlip?: boolean;
  pathGap?: number;
};
export type ColorbarSpec = Placed & {
  x: number; // % of the container (top-left corner of the bar)
  y: number;
  length: number; // % of the container height (vertical) or width (horizontal)
  thickness: number; // pt
  orientation: 'vertical' | 'horizontal';
  title: string;
  text: TextStyle;
  frameWidth: number;
  ticks: number; // about this many labels
  // the side of its ticks, values and title: end (right of a vertical bar, under a horizontal one; absent) or start
  side?: 'start' | 'end';
  // the values written: about `ticks` of them (auto, absent), every `every` from `everyFrom` (absent: a multiple of it),
  // the levels of a map filled by levels, its two ends, a list (custom: "0, 0.5, 1"), or none (the ticks where auto puts
  // them)
  labels?: 'auto' | 'every' | 'levels' | 'minmax' | 'custom' | 'none';
  every?: number;
  everyFrom?: number;
  custom?: string;
  // the numbers as on an axis (absent: auto), with so many decimals (absent: as the step needs)
  format?: LabelFormat;
  decimals?: number;
  // the ticks: outside the bar (absent), inside, across its edge, or none; their length (pt, absent 2); minor ticks
  // between two values (absent: 0; a log map: its 2 … 9 of every decade)
  tickDir?: 'out' | 'in' | 'both' | 'none';
  tickLen?: number;
  minor?: number;
};
// locked: drawn, but not moved with the mouse (a Figure Drawing's object locked in its layers); clip: an outline (path
// text in its units) it is cut to; mask: a shape whose lightness shows it (white: all of it, black: none)
// shift: drawn moved by so much (in its units: a drawing's object pinned to the data of the Plot under it)
type AnnBase = { key: string; owner?: Owner; locked?: boolean; clip?: string; mask?: ShapeSpec; shift?: [number, number] };
export type Annotation = (AnnBase & { kind: 'shape'; shape: ShapeSpec }) | (AnnBase & { kind: 'text'; text: TextSpec }) | (AnnBase & { kind: 'colorbar'; bar: ColorbarSpec; curve: Curve | null });

// One frame of axes with what is drawn in it. auto: the frame is placed by the margins its axes need (pad pt more
// around) — style.pos holds the place found; text: the default text of its Plot (else the figure's); node: the Plot.
// drawing: not axes but a Figure Drawing — its page w × h pt, its annotations in mm from the page's top-left corner
// (coords 'data'), drawn whole (no axes), scaled to fit its place (style.pos) and centred there.
// overlay: a drawing over the rest of its figure (annotating a Plot): no panel of its own
// beneath: (an overlay) drawn inside the frame of that Axes (its key), under its curves
export type AxesFig = { key: string; style: AxesStyle; curves: Curve[]; legends: LegendSpec[]; annotations: Annotation[]; auto?: boolean; pad?: number; text?: TextDefaults; node?: string; inset?: InsetPlace; drawing?: { w: number; h: number }; overlay?: boolean; beneath?: string };
// An inset: another Plot drawn inside the frame of its host (the Axes `host`): its box at x, y, w, h (% of the host's
// frame), on a background; zoom: the inset's ranges marked on the host (a rectangle) and joined to it by two lines.
// owner: the host Plot (its data keep the place); box: the place found (% of the page).
export type InsetLine = { color: string; width: number; dash: Dash; opacity: number };
export type InsetItem = { key: string; x: number; y: number; w: number; h: number; zoom: boolean; line: InsetLine; background: string };
// aspect: the box kept as wide / high as this (a Plot with a drawing over it: one picture), fixed: its frame there (% of the
// box) instead of placed by its margins
export type InsetPlace = Omit<InsetItem, 'key'> & { host: string; owner: string; box?: Placement; aspect?: number; fixed?: Placement };
// background: '' as the inset Plot's own page (white, or none when transparent) — so is '#ffffff', the default before;
// 'none', 'white' or a colour chosen in the Insets tab
export const INSET_DEFAULTS: Omit<InsetItem, 'key'> = { x: 54, y: 5, w: 42, h: 45, zoom: false, line: { color: '#555555', width: 0.75, dash: 'dash', opacity: 1 }, background: '' };
export const insetBackground = (chosen: string | undefined, page: string | undefined): string => (!chosen || chosen === '#ffffff' ? page || '#ffffff' : chosen === 'white' ? '#ffffff' : chosen);
// A Plot in a Merge: its box (% of the page) — the cell of the grid, or placed by hand (free).
// A border around a page or a Plot's box: width (pt, 0 = none), colour, line, rounded corners (pt), opacity, its
// distance in from the edge (pt).
export type PageBorder = { width: number; color: string; dash: Dash; radius: number; opacity: number; inset: number };
// background: of a Plot placed by hand over the others (an inset in the Merge) — its page's ground under it
export type FigureBox = { key: string; box: Placement; free: boolean; border?: PageBorder; background?: string };

export type LengthUnit = 'mm' | 'cm' | 'in';
export type PanelScheme = 'none' | 'a' | '(a)' | 'a)' | 'A' | '(A)' | 'A)';
export type Figure = {
  width: number;
  height: number;
  unit: LengthUnit;
  text: TextDefaults;
  background: string; // 'none' = transparent, else a colour
  border: number; // pt, 0 = none
  borderColor: string;
  borderDash?: Dash;
  borderRadius?: number;
  borderOpacity?: number;
  borderInset?: number;
  panels: PanelScheme;
  panelText: TextStyle;
  panelX: number; // pt from the left of each frame (negative: outside)
  panelY: number; // pt from the top of each frame
  panelBox?: string; // a ground behind the labels
  axes: AxesFig[];
  legends: LegendSpec[];
  annotations: Annotation[];
  key?: string; // the node (Plot or Merge)
  boxes?: FigureBox[]; // a Merge: the box of every Plot on it (moved, resized in “Edit layout”)
  comma?: boolean; // the numbers it writes with a decimal comma
};

export const PT_PER: Record<LengthUnit, number> = { mm: 72 / 25.4, cm: 720 / 25.4, in: 72 };
export const toPt = (v: number, u: LengthUnit) => v * PT_PER[u];

// Okabe & Ito: eight colours told apart with every kind of colour vision (black first).
export const PALETTE = ['#000000', '#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#F0E442'];

export const FONTS: [string, string][] = [
  ['Arial, Helvetica, sans-serif', 'Arial'],
  ['Helvetica, Arial, sans-serif', 'Helvetica'],
  ["'Times New Roman', Times, serif", 'Times New Roman'],
  ['Calibri, Carlito, sans-serif', 'Calibri'],
  ['Cambria, Caladea, serif', 'Cambria'],
  ['Verdana, sans-serif', 'Verdana'],
  ['Georgia, serif', 'Georgia'],
  ["'Courier New', monospace", 'Courier New'],
];

// ---- defaults ----
export const TEXT_DEFAULTS: TextDefaults = { font: FONTS[0][0], size: 8, bold: false, italic: false, color: '#000000' };
export const AXIS_DEFAULTS: AxisSpec = { title: '', min: NaN, max: NaN, range: 'nice', scale: 'linear', step: NaN, count: NaN, minor: 1, reverse: false, custom: '', ticksBy: 'auto', first: NaN, labelEvery: 1 };
export const SIDE_DEFAULTS: SideStyle = {
  line: true,
  ticks: 'in',
  minorTicks: true,
  labels: true,
  showTitle: true,
  color: '#000000',
  lineWidth: 0.75,
  tickWidth: 0.75,
  tickLen: 4,
  minorLen: 2,
  offset: 0,
  title: '',
  titleText: {},
  titleGap: 3,
  titleAlign: 'center',
  titleAt: 50,
  labelText: {},
  format: 'auto',
  decimals: NaN,
  prefix: '',
  suffix: '',
  factor: 1,
  rotation: 0,
  labelGap: 2.5,
  plus: false,
  hideFirst: false,
  hideLast: false,
};
// top and right: the line and the ticks, no labels or title (a box)
const MIRROR_SIDE: SideStyle = { ...SIDE_DEFAULTS, labels: false, showTitle: false };
export const GRID_DEFAULTS: GridStyle = { major: false, minor: false, color: '#c8c8c8', width: 0.4, dash: 'solid', opacity: 1, minorColor: '#e4e4e4' };
export const AXES_STYLE_DEFAULTS: AxesStyle = {
  x: AXIS_DEFAULTS,
  y: AXIS_DEFAULTS,
  top: { mode: 'mirror', scale: AXIS_DEFAULTS, fn: '1239.84/x' },
  right: { mode: 'mirror', scale: AXIS_DEFAULTS, fn: '' },
  sides: { bottom: SIDE_DEFAULTS, left: SIDE_DEFAULTS, top: MIRROR_SIDE, right: MIRROR_SIDE },
  grid: { x: GRID_DEFAULTS, y: GRID_DEFAULTS },
  background: '',
  clip: true,
  pos: { x: 17, y: 5, w: 78, h: 74 },
  panelLabel: '',
  extra: [],
};
export const CURVE_STYLE_DEFAULTS: CurveStyle = {
  mode: 'line',
  color: '#000000',
  lineWidth: 1,
  dash: 'solid',
  connect: 'straight',
  stepKind: 'hv',
  lineOpacity: 1,
  symbol: 'circle',
  symbolSize: 4,
  symbolFill: 'filled',
  symbolEdge: 0.6,
  edgeColor: '',
  symbolOpacity: 1,
  every: 1,
  drop: 'none',
  fill: 'none',
  show: true,
  fillFormula: '0',
  fillCurve: 1,
  fillPoints: '',
  fillColor: '',
  fillOpacity: 0.25,
  errWidth: 0.6,
  errCap: 3,
  errStyle: 'bars',
  errDir: 'both',
  errColor: '',
  errOpacity: 1,
  errFrom: 'column',
  errValue: 5,
  errAsym: false,
  errCapWidth: NaN,
  errDash: 'solid',
  errEvery: 1,
  errGap: false,
  errAbove: false,
  errBandEdge: 0,
  errX: { same: true, width: 0.6, cap: 3, color: '', dash: 'solid', dir: 'both' },
  masked: 'faded',
  colorBy: 'none',
  cmap: 'viridis',
  cmapColors: ['#2166ac', '#f7f7f7', '#b2182b'],
  cmapMin: NaN,
  cmapMax: NaN,
  cmapReverse: false,
  cmapLog: false,
  categorical: false,
  colorTarget: 'both',
  sizeBy: 'none',
  sizeMin: 2,
  sizeMax: 8,
  labels: 'none',
  labelPos: 'above',
  labelDigits: 3,
  labelText: {},
  axisX: 'bottom',
  axisY: 'left',
};
export const LEGEND_STYLE_DEFAULTS: Omit<LegendSpec, 'key' | 'curves'> = {
  x: 4,
  y: 4,
  anchor: 'tl',
  arrange: 'column',
  fill: 'down',
  entries: [],
  attach: '',
  z: 3,
  columns: 1,
  reverse: false,
  title: '',
  text: {},
  frame: 'none',
  frameColor: '#000000',
  frameWidth: 0.5,
  background: '',
  bgOpacity: 1,
  padding: 4,
  spacing: 1.3,
  lineLen: 16,
};
export const SHAPE_DEFAULTS: ShapeSpec = {
  kind: 'arrow',
  coords: 'percent',
  x1: 30,
  y1: 30,
  x2: 50,
  y2: 50,
  points: '20 20; 40 20; 30 40',
  color: '#000000',
  width: 0.75,
  dash: 'solid',
  opacity: 1,
  fill: '',
  fillOpacity: 0.3,
  head1: 'none',
  head2: 'triangle',
  headSize: 5,
  radius: 0,
  rotation: 0,
  below: false,
  attach: '',
  z: 1,
  text: '',
  textStyle: {},
};
export const TEXT_SPEC_DEFAULTS: TextSpec = { text: 'Text', coords: 'percent', x: 50, y: 50, anchor: 'c', rotation: 0, style: {}, box: 'none', boxColor: '#ffffff', borderColor: '#000000', borderWidth: 0.5, padding: 2, attach: '', z: 2 };
export const COLORBAR_DEFAULTS: ColorbarSpec = { x: 88, y: 10, length: 70, thickness: 6, orientation: 'vertical', title: '', text: {}, frameWidth: 0.5, ticks: 5, attach: '', z: 2 };

// Full styles from what a node stores (older projects: fewer fields).
export const curveStyle = (s: Partial<CurveStyle> | undefined): CurveStyle => ({ ...CURVE_STYLE_DEFAULTS, ...s, errX: { ...CURVE_STYLE_DEFAULTS.errX, ...s?.errX } });

// A full axis scale; older projects have no `ticksBy`: it follows from what they set (ticks at values, a step, a count).
export function axisSpec(a: Partial<AxisSpec> | undefined): AxisSpec {
  const s = { ...AXIS_DEFAULTS, ...a };
  if (!a?.ticksBy) s.ticksBy = s.custom?.trim() ? 'values' : Number.isFinite(s.step) && s.step > 0 ? 'increment' : Number.isFinite(s.count) && s.count >= 2 ? 'count' : 'auto';
  return s;
}

type LegacyAxes = Partial<AxesStyle> & { frame?: 'box' | 'open'; axisWidth?: number; tickDir?: 'in' | 'out' | 'both'; tickLen?: number; minorLen?: number; tickFont?: number; titleFont?: number; grid?: boolean | AxesStyle['grid'] };
// v0.1 kept one look for all sides (frame, axisWidth, tickDir, fonts …) and the titles in x / y: read into the sides.
export function axesStyle(s: LegacyAxes | undefined): AxesStyle {
  const d = AXES_STYLE_DEFAULTS;
  const st = s ?? {};
  const x = axisSpec(st.x);
  const y = axisSpec(st.y);
  const legacy: Partial<SideStyle> = {
    ...(st.axisWidth !== undefined ? { lineWidth: st.axisWidth, tickWidth: st.axisWidth } : {}),
    ...(st.tickDir ? { ticks: st.tickDir } : {}),
    ...(st.tickLen !== undefined ? { tickLen: st.tickLen } : {}),
    ...(st.minorLen !== undefined ? { minorLen: st.minorLen } : {}),
    ...(st.tickFont ? { labelText: { size: st.tickFont } } : {}),
    ...(st.titleFont ? { titleText: { size: st.titleFont } } : {}),
  };
  const side = (k: Side): SideStyle => {
    const base = { ...d.sides[k], ...legacy, ...st.sides?.[k] };
    if (!st.sides && st.frame === 'open' && (k === 'top' || k === 'right')) Object.assign(base, { line: false, ticks: 'none' });
    if (!st.sides?.[k]?.title && k === 'bottom' && x.title) base.title = x.title;
    if (!st.sides?.[k]?.title && k === 'left' && y.title) base.title = y.title;
    return base;
  };
  const grid = typeof st.grid === 'object' && st.grid ? st.grid : { x: { ...GRID_DEFAULTS, major: st.grid === true }, y: { ...GRID_DEFAULTS, major: st.grid === true } };
  return {
    x,
    y,
    top: { ...d.top, ...st.top, scale: axisSpec(st.top?.scale) },
    right: { ...d.right, ...st.right, scale: axisSpec(st.right?.scale) },
    sides: { bottom: side('bottom'), left: side('left'), top: side('top'), right: side('right') },
    grid: { x: { ...GRID_DEFAULTS, ...grid.x }, y: { ...GRID_DEFAULTS, ...grid.y } },
    background: st.background ?? '',
    clip: st.clip ?? true,
    pos: { ...d.pos, ...st.pos },
    panelLabel: st.panelLabel ?? '',
    extra: (st.extra ?? []).map((e) => ({ ...e, scale: axisSpec(e.scale), style: { ...SIDE_DEFAULTS, ...e.style } })),
    ...(st.free ? { free: true } : {}),
    ...(st.aspect && st.aspect > 0 ? { aspect: st.aspect } : {}),
  };
}

// A value of the data as a size (pt) from lo to hi over the range [a, b] (log: by decades; outside: the nearest end),
// reversed, or with the area (not the width) in proportion. NaN when the value has no size.
export function scaledSize(v: number, range: [number, number], lo: number, hi: number, o: { log?: boolean; reverse?: boolean; area?: boolean } = {}): number {
  if (!Number.isFinite(v)) return NaN;
  const f = (u: number) => (o.log ? (u > 0 ? Math.log10(u) : NaN) : u);
  const a = f(range[0]);
  let t = (f(v) - a) / (f(range[1]) - a || 1);
  if (!Number.isFinite(t)) return NaN;
  t = Math.min(1, Math.max(0, t));
  if (o.reverse) t = 1 - t;
  return o.area ? Math.sqrt(lo * lo + t * (hi * hi - lo * lo)) : lo + t * (hi - lo);
}
