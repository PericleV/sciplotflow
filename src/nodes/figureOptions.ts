// Options shared by the figure nodes: dash and anchor lists, the canvas default text.
import type { Anchor, ArrowHead, Dash, Hatch, SymbolShape } from '../figure/spec.ts';

// the heads at the ends of arrows, polylines and curves
export const HEADS: [ArrowHead, string][] = [
  ['none', 'none'],
  ['triangle', '▶ triangle'],
  ['stealth', '➤ stealth'],
  ['open', '> open'],
  ['bar', '| bar'],
  ['circle', '● circle'],
  ['diamond', '◆ diamond'],
  ['square', '■ square'],
  ['half', '◤ half'],
];

// the hatchings of bars, boxes and violins
export const HATCHES: [Hatch, string][] = [
  ['none', 'none'],
  ['/', '/ / /'],
  ['\\', '\\ \\ \\'],
  ['x', 'x x x (crossed)'],
  ['|', '| | | (vertical)'],
  ['-', '— (horizontal)'],
  ['+', '+ (grid)'],
  ['.', '· · · (dots)'],
  ['dots2', '⁘ dots, staggered'],
  ['o', 'o o o (rings)'],
  ['squares', '▫ squares'],
  ['xs', '× small crosses'],
  ['brick', '▤ bricks'],
  ['zigzag', '⩘ zigzag'],
  ['wave', '∿ waves'],
  ['checker', '▚ checkerboard'],
  ['text', 'Aa text of your own'],
];

export const DASHES: [Dash, string][] = [
  ['solid', 'solid ────'],
  ['dash', 'dash – – –'],
  ['longdash', 'long dash — —'],
  ['shortdash', 'short dash - - -'],
  ['dot', 'dot ·····'],
  ['dashdot', 'dash-dot –·–·'],
  ['dashdotdot', 'dash-dot-dot –··'],
];
export const SYMBOLS: [SymbolShape, string][] = [
  ['circle', '● circle'],
  ['square', '■ square'],
  ['triangle', '▲ triangle'],
  ['triangleDown', '▼ triangle down'],
  ['triangleLeft', '◀ triangle left'],
  ['triangleRight', '▶ triangle right'],
  ['diamond', '◆ diamond'],
  ['pentagon', '⬟ pentagon'],
  ['hexagon', '⬢ hexagon'],
  ['star', '★ star'],
  ['cross', '✕ cross'],
  ['plus', '+ plus'],
];
export const ANCHORS: [Anchor, string][] = [
  ['tl', 'top left'],
  ['tc', 'top centre'],
  ['tr', 'top right'],
  ['cl', 'middle left'],
  ['c', 'centre'],
  ['cr', 'middle right'],
  ['bl', 'bottom left'],
  ['bc', 'bottom centre'],
  ['br', 'bottom right'],
];

// The layers of a legend or annotation: below 0 under the data, the data at 0, higher numbers over lower ones.
export const LAYERS: [number, string][] = [
  [-2, 'under the data (−2)'],
  [-1, 'under the data (−1)'],
  [1, 'over the data (1)'],
  [2, 'over the data (2)'],
  [3, 'over the data (3)'],
  [4, 'over the data (4)'],
  [5, 'on top (5)'],
];
