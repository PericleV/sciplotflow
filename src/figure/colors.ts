// Colour maps for colouring the data (samples of the published maps, linear between the stops) and the colour of a
// value.
import { PALETTE, type ColorMapName, type Curve } from './spec.ts';

export const COLOR_MAPS: Record<Exclude<ColorMapName, 'custom'>, { label: string; stops: string[] }> = {
  viridis: { label: 'viridis', stops: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'] },
  plasma: { label: 'plasma', stops: ['#0d0887', '#46039f', '#7201a8', '#9c179e', '#bd3786', '#d8576b', '#ed7953', '#fb9f3a', '#fdca26', '#f0f921'] },
  inferno: { label: 'inferno', stops: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'] },
  magma: { label: 'magma', stops: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2f7f', '#cd4071', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'] },
  cividis: { label: 'cividis', stops: ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8779', '#a69d75', '#c4b56c', '#e4cf5b', '#fee838'] },
  turbo: { label: 'turbo (rainbow)', stops: ['#30123b', '#4145ab', '#4675ed', '#39a2fc', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#f3c63a', '#fe9b2d', '#f36315', '#d93806', '#b11901', '#7a0403'] },
  coolwarm: { label: 'cool–warm (diverging)', stops: ['#3b4cc0', '#6788ee', '#9abbff', '#c9d7f0', '#edd1c2', '#f7a889', '#e26952', '#b40426'] },
  rdbu: { label: 'blue–white–red', stops: ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'] },
  gray: { label: 'black → white', stops: ['#000000', '#ffffff'] },
};
export const CMAP_OPTIONS: [ColorMapName, string][] = [...(Object.keys(COLOR_MAPS) as Exclude<ColorMapName, 'custom'>[]).map((k): [ColorMapName, string] => [k, COLOR_MAPS[k].label]), ['custom', 'my colours (2–3)']];

const hexRgb = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

export const stopsOf = (name: ColorMapName, custom: string[]) => (name === 'custom' ? (custom.length >= 2 ? custom : ['#2166ac', '#b2182b']) : COLOR_MAPS[name].stops);

// Palettes of distinct colours for curves (Okabe–Ito: safe for colour-blind readers; ten categorical colours; the
// ColorBrewer sets; Paul Tol's bright; greys for print)
export const PALETTES: [string, string, string[]][] = [
  ['okabe', 'Okabe–Ito', ['#000000', '#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7']],
  ['tab10', 'Category 10', ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf']],
  ['set1', 'ColorBrewer Set1', ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628', '#f781bf', '#999999']],
  ['dark2', 'ColorBrewer Dark2', ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666']],
  ['paired', 'ColorBrewer Paired', ['#1f78b4', '#a6cee3', '#33a02c', '#b2df8a', '#e31a1c', '#fb9a99', '#ff7f00', '#fdbf6f', '#6a3d9a', '#cab2d6', '#b15928']],
  ['tol', 'Paul Tol bright', ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377', '#BBBBBB']],
  ['greys', 'greys (print)', ['#000000', '#555555', '#888888', '#b0b0b0']],
];

// n colours spread evenly over a map (its first stop to its last), in order
export const spreadColors = (stops: string[], n: number): string[] => Array.from({ length: n }, (_, j) => mapColor(stops, n > 1 ? j / (n - 1) : 0));

// The colour at t ∈ [0, 1] of a map.
export function mapColor(stops: string[], t: number): string {
  const rgb = stops.map(hexRgb);
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (rgb.length - 1);
  const i = Math.min(rgb.length - 2, Math.floor(x));
  const f = x - i;
  return toHex([0, 1, 2].map((k) => rgb[i][k] + f * (rgb[i + 1][k] - rgb[i][k])));
}

// A colour scale shaped by hand: the places of its colours along it (pos: one per stop, 0 … 1 in order; absent: evenly
// spread), its balance (−1 … 1: more room for the colours of its start, or of its end), and the part of it used (from …
// to, 0 … 1). Sampled to n stops evenly spread, as every map is drawn: the curves, the colour bar and the legend agree.
export type ScaleShape = { pos?: number[]; bias?: number; from?: number; to?: number };
export const isShaped = (s: ScaleShape) => !!(s.pos?.length || s.bias || (s.from !== undefined && s.from > 0) || (s.to !== undefined && s.to < 1));
export function shapedStops(stops: string[], s: ScaleShape, n = 33): string[] {
  if (!isShaped(s) || stops.length < 2) return stops;
  const from = Math.min(1, Math.max(0, s.from ?? 0));
  const to = Math.min(1, Math.max(0, s.to ?? 1));
  const g = 4 ** -Math.min(1, Math.max(-1, s.bias ?? 0));
  // the places of the stops (in order; the colour before the first and after the last kept)
  const pos = s.pos?.length === stops.length ? s.pos.map((p) => Math.min(1, Math.max(0, p))) : stops.map((_, i) => i / (stops.length - 1));
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1]);
  const rgb = stops.map(hexRgb);
  const at = (u: number) => {
    if (u <= pos[0]) return toHex(rgb[0]);
    for (let i = 1; i < pos.length; i++)
      if (u <= pos[i]) {
        const f = pos[i] > pos[i - 1] ? (u - pos[i - 1]) / (pos[i] - pos[i - 1]) : 1;
        return toHex([0, 1, 2].map((k) => rgb[i - 1][k] + f * (rgb[i][k] - rgb[i - 1][k])));
      }
    return toHex(rgb[rgb.length - 1]);
  };
  return Array.from({ length: n }, (_, j) => at(from + (to - from) * (j / (n - 1)) ** g));
}

// Position of a value in the range of the map (linear or log), 0 … 1, reversed if asked.
export function mapT(v: number, lo: number, hi: number, log: boolean, reverse: boolean): number {
  let t = log ? (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) : (v - lo) / (hi - lo || 1);
  if (!Number.isFinite(t)) t = 0;
  t = Math.min(1, Math.max(0, t));
  return reverse ? 1 - t : t;
}

// Categories (integers or texts) → palette colours, in order of first appearance.
export function categoryColors(values: ArrayLike<number>, text?: string[]): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const k = text && text[i] !== undefined && text[i] !== '' ? text[i] : Number.isFinite(values[i]) ? String(Math.trunc(values[i])) : '';
    if (!seen.has(k)) seen.set(k, PALETTE[(seen.size + 1) % PALETTE.length]);
    out.push(k === '' ? '#999999' : seen.get(k)!);
  }
  return out;
}

// The colour of a curve in a legend: the middle of its map when it is coloured by a map.
export const legendColor = (c: Curve) => (c.style.colorBy !== 'none' && !c.style.categorical ? mapColor(stopsOf(c.style.cmap, c.style.cmapColors), 0.5) : c.style.color);
