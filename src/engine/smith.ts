// Smith chart: impedances, admittances or reflection coefficients drawn as Γ in the unit circle. Read as Z (R, X in Ω)
// or Y (G, B in S), normalized by Z0 (or given normalized), as Γ (its real and imaginary parts, or its magnitude and
// phase) or as S11 (dB and phase); a curve per group, in the order of the frequency. The grid: circles of constant
// resistance and arcs of constant reactance (impedance), their mirror (admittance), or both; circles of constant VSWR,
// arcs of constant Q, the matching circle; a scale outside the rim (the angle of Γ, wavelengths toward the generator).
// Markers at chosen frequencies with what is asked of them (f, z or Z, Γ, VSWR, return loss). Pure: drawn by
// figure/render.tsx.
import { column, fmtNum, unitOf } from './table.ts';
import { mapColor, mapT, stopsOf } from '../figure/colors.ts';
import { curveStyle, PALETTE, type ColorMapName, type Curve, type SmithFrame, type SmithSeries, type SymbolShape } from '../figure/spec.ts';
import { maxOf, minOf } from './minmax.ts';

export type SmithInput = 'z' | 'y' | 'gamma' | 'gammaPolar' | 's11';
export type SmithInfo = 'f' | 'z' | 'gamma' | 'vswr' | 'rl';
export type SmithSpec = {
  input: SmithInput;
  a: string; // the first column: R, G, Re Γ, |Γ| or S11 (dB) ('' = the first Y)
  b: string; // the second: X, B, Im Γ, the phase (°) ('' = the next Y)
  freq: string; // the frequency ('' = the designated X, '-' = none)
  group?: string; // a curve per value of this column
  z0: number; // Ω
  norm?: boolean; // Z or Y given normalized already
  mode: 'line' | 'linesymbol' | 'scatter';
  color: string;
  colors?: string[]; // of the groups
  lineWidth: number;
  symbol: SymbolShape;
  symbolSize: number;
  colorBy?: 'one' | 'freq';
  cmap: ColorMapName;
  colorbar?: boolean;
  arrows?: boolean; // the direction of increasing frequency
  markers?: string; // frequencies, comma-separated (the nearest point of each curve)
  markerInfo?: SmithInfo[];
  markerTable?: 'tl' | 'tr' | 'bl' | 'br' | 'none'; // where the table of the markers is (absent: top left)
  // the chart (its Axes tab)
  grid: 'z' | 'y' | 'both';
  density: 'coarse' | 'medium' | 'fine';
  rList?: string; // own circles of constant r (and g)
  xList?: string; // own arcs of constant x (and b)
  gridColor: string;
  yColor: string;
  gridWidth?: number;
  gridLabels: boolean;
  vswr?: string;
  qArcs?: string;
  match?: boolean;
  scale?: 'none' | 'angle' | 'wavelengths';
};

export const SMITH_DENSITY: Record<SmithSpec['density'], number[]> = {
  coarse: [0.2, 0.5, 1, 2, 5],
  medium: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.5, 2, 3, 4, 5, 10, 20],
  fine: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 4, 5, 7, 10, 20, 50],
};

type C = [number, number];
const cdiv = ([a, b]: C, [c, d]: C): C => {
  const q = c * c + d * d;
  return [(a * c + b * d) / q, (b * c - a * d) / q];
};
// Γ of a normalized impedance, and the impedance of Γ
export const gammaOfZ = (z: C): C => cdiv([z[0] - 1, z[1]], [z[0] + 1, z[1]]);
export const zOfGamma = (g: C): C => cdiv([1 + g[0], g[1]], [1 - g[0], -g[1]]);

// Γ of every row, by what the two columns are
export function toGamma(input: SmithInput, a: ArrayLike<number>, b: ArrayLike<number>, z0: number, norm: boolean): C[] {
  const k = norm || !(z0 > 0) ? 1 : z0;
  return Array.from(a, (av, i): C => {
    const bv = b[i];
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return [NaN, NaN];
    switch (input) {
      case 'z':
        return gammaOfZ([av / k, bv / k]);
      case 'y': {
        // y = Y·Z0: Γ = (1 − y) / (1 + y)
        const y: C = norm ? [av, bv] : [av * k, bv * k];
        return cdiv([1 - y[0], -y[1]], [1 + y[0], y[1]]);
      }
      case 'gamma':
        return [av, bv];
      case 'gammaPolar':
        return [av * Math.cos((bv * Math.PI) / 180), av * Math.sin((bv * Math.PI) / 180)];
      case 's11': {
        const m = 10 ** (av / 20);
        return [m * Math.cos((bv * Math.PI) / 180), m * Math.sin((bv * Math.PI) / 180)];
      }
    }
  });
}

const list = (s: string | undefined) => (s ?? '').split(/[,;\s]+/).map(Number).filter((v) => Number.isFinite(v) && v > 0);
const fmtC = ([a, b]: C, digits = 3) => `${fmtNum(+a.toPrecision(digits))} ${b < 0 ? '−' : '+'} j${fmtNum(+Math.abs(b).toPrecision(digits))}`;

// what a marker says of a point: its frequency, z (or Z in Ω), Γ, VSWR, return loss
export function markerText(g: C, f: number, info: SmithInfo[], z0: number, norm: boolean, fName: string): string[] {
  const out: string[] = [];
  const mag = Math.hypot(g[0], g[1]);
  for (const what of info) {
    if (what === 'f' && Number.isFinite(f)) out.push(`f = ${fmtNum(+f.toPrecision(6))}${unitOf(fName) ? ` ${unitOf(fName)}` : ''}`);
    if (what === 'z') {
      const z = zOfGamma(g);
      out.push(norm || !(z0 > 0) ? `z = ${fmtC(z)}` : `Z = ${fmtC([z[0] * z0, z[1] * z0])} Ω`);
    }
    if (what === 'gamma') out.push(`Γ = ${fmtNum(+mag.toPrecision(3))} ∠ ${fmtNum(+((Math.atan2(g[1], g[0]) * 180) / Math.PI).toFixed(1)).replace('-', '−')}°`);
    if (what === 'vswr') out.push(`VSWR = ${mag < 1 ? fmtNum(+((1 + mag) / (1 - mag)).toPrecision(3)) : '∞'}`);
    if (what === 'rl') out.push(`RL = ${mag > 0 ? fmtNum(+(-20 * Math.log10(mag)).toPrecision(3)) : '∞'} dB`);
  }
  return out;
}

export type SmithSet = { name: string; g: C[]; f: number[] };

// The curves of a Smith chart: the frame (its series as Γ, the grid, the markers) and the legend
export function smithChart(data: SmithSet[], d: SmithSpec, fName: string): { curves: Curve[]; colorRange: [number, number] | null; warnings: string[] } | string {
  const warnings: string[] = [];
  if (!data.some((s) => s.g.some((p) => Number.isFinite(p[0])))) return 'No values to draw.';
  const outside = data.reduce((n, s) => n + s.g.filter((p) => Math.hypot(p[0], p[1]) > 1 + 1e-9).length, 0);
  if (outside) warnings.push(`${outside} point${outside > 1 ? 's' : ''} outside the unit circle (|Γ| > 1: an active load, or the wrong columns): drawn at the rim.`);
  const fs = data.flatMap((s) => s.f.filter(Number.isFinite));
  const byFreq = d.colorBy === 'freq' && fs.length > 0;
  const range: [number, number] | null = byFreq ? [minOf(fs), maxOf(fs)] : null;
  const stops = stopsOf(d.cmap, []);
  const info = d.markerInfo?.length ? d.markerInfo : (['f', 'z'] as SmithInfo[]);
  const marks = list(d.markers);
  const series: SmithSeries[] = data.map((s, j) => {
    const color = d.colors?.[j] || (data.length === 1 ? d.color : PALETTE[(j + 1) % PALETTE.length]) || '#1f77b4';
    // (on the rim at most)
    const g = s.g.map((p): C => {
      const m = Math.hypot(p[0], p[1]);
      return m > 1 ? [p[0] / m, p[1] / m] : p;
    });
    const markers = marks.flatMap((mf) => {
      let best = -1;
      for (let i = 0; i < s.f.length; i++) if (Number.isFinite(s.f[i]) && Number.isFinite(g[i][0]) && (best < 0 || Math.abs(s.f[i] - mf) < Math.abs(s.f[best] - mf))) best = i;
      return best < 0 ? [] : [{ u: g[best][0], v: g[best][1], lines: markerText(s.g[best], s.f[best], info, d.z0, !!d.norm, fName) }];
    });
    if (marks.length && !s.f.some(Number.isFinite)) warnings.push('Markers: no frequency column (choose it in Frequency).');
    return {
      name: s.name,
      u: g.map((p) => p[0]),
      v: g.map((p) => p[1]),
      f: s.f,
      color,
      ...(range ? { colors: s.f.map((f) => (Number.isFinite(f) ? mapColor(stops, mapT(f, range[0], range[1], false, false)) : color)) } : {}),
      mode: d.mode,
      lineWidth: d.lineWidth,
      symbol: d.symbol,
      symbolSize: d.symbolSize,
      markers,
      tips: s.g.map((p, i) => markerText(p, s.f[i], ['f', 'z', 'gamma', 'vswr', 'rl'], d.z0, !!d.norm, fName).join('\n')),
    };
  });
  const circles = list(d.rList);
  const arcs = list(d.xList);
  const frame: SmithFrame = {
    series,
    grid: d.grid,
    r: circles.length ? circles : SMITH_DENSITY[d.density],
    x: arcs.length ? arcs : SMITH_DENSITY[d.density],
    labels: d.gridLabels ? (circles.length ? circles : SMITH_DENSITY.coarse) : [],
    xLabels: d.gridLabels ? (arcs.length ? arcs : SMITH_DENSITY.coarse) : [],
    gridColor: d.gridColor || '#9aa3b2',
    yColor: d.yColor || '#d08770',
    gridWidth: d.gridWidth && d.gridWidth > 0 ? d.gridWidth : 0.4,
    vswr: list(d.vswr).filter((v) => v > 1),
    q: list(d.qArcs),
    match: !!d.match,
    scale: d.scale ?? 'none',
    arrows: !!d.arrows,
    table: d.markerTable ?? 'tl',
  };
  const empty = () => ({ name: '', x: column('x', new Float64Array(0)), y: column('y', new Float64Array(0)) });
  const curves: Curve[] = [
    { key: 'smith', label: 'smith', noLegend: true, series: empty(), style: curveStyle({ color: frame.gridColor, cmap: d.cmap }), smith: frame, ...(range ? { colorRange: range, group: { base: 'smith', index: 0, count: 1, value: NaN, name: fName || 'f', range, color: 'map' as const } } : {}) },
    ...series.map((s, j) => ({
      key: `sm:${j}`,
      label: s.name,
      ...(series.length === 1 ? { noLegend: true } : {}),
      series: empty(),
      style: curveStyle({ mode: s.mode, color: s.color, lineWidth: s.lineWidth, symbol: s.symbol, symbolSize: s.symbolSize }),
    })),
  ];
  return { curves, colorRange: range, warnings };
}
