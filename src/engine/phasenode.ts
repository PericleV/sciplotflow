// The Phase diagram node: a binary diagram computed from its thermodynamic model (src/engine/phase.ts) made into the
// curves and shapes of a figure — the phase regions coloured (two phases: their colours mixed, hatched), the
// liquidus, solidus and solvus, the eutectic line, the phase names —, the lever rule at the points chosen (the tie
// line, the compositions and amounts written beside it), an alloy cooled (a line down the diagram; a second figure of
// the amounts of its phases against the temperature, stacked) — and the tables of all of it. Pure.
import { column, type Column, type Dataset } from './table.ts';
import { cooling, lever, phaseDiagram, type Diagram, type Lever, type PhaseModel } from './phase.ts';
import { SHAPE_DEFAULTS, TEXT_SPEC_DEFAULTS, curveStyle, PALETTE, type Curve } from '../figure/spec.ts';
import type { AnnotationItem, PlotLegend, PlotPage } from '../types.ts';
import type { AxesStyle } from '../figure/spec.ts';

// the node's settings: the components (names, melting points in °C or K, enthalpies of fusion and the interaction
// parameters in kJ/mol), the temperature range (NaN: automatic), the points of the lever rule (at% B, T), the alloy
// cooled (at% B; NaN: none), the phase names written in the regions
export type PhaseDiagramData = {
  preset?: string;
  a: string;
  b: string;
  unit: 'C' | 'K';
  tmA: number;
  tmB: number;
  hA: number;
  hB: number;
  omegaL: number;
  omegaS: number;
  omegaL1?: number; // the asymmetric terms (Redlich–Kister: Ω = Ω₀ + Ω₁ (1 − 2x)); absent: 0
  omegaS1?: number;
  tMin: number;
  tMax: number;
  points: [number, number][];
  alloy: number;
  labels: boolean;
  axes?: Partial<AxesStyle>;
  legend?: PlotLegend;
  annotations?: AnnotationItem[];
  page?: Partial<PlotPage>;
  coolingPage?: Partial<PlotPage>;
};

// Example systems: their melting points and enthalpies of fusion (handbook values, rounded) and interaction parameters
// fitted so the eutectic and the limits of solubility at it come out near the real diagram (Pb–Sn: 183 °C, 73.8 at%
// Sn, α to 28 at% Sn, β to 2.2 at% Pb — real 1.3; Ag–Cu: 779 °C, 39.9 at% Cu, α to 14.1 at% Cu, β to 4.9 at% Ag), the
// liquidus falling from both melting points — a teaching model, not assessed thermodynamic data
type PresetV = Pick<PhaseDiagramData, 'a' | 'b' | 'tmA' | 'tmB' | 'hA' | 'hB' | 'omegaL' | 'omegaS' | 'omegaL1' | 'omegaS1'>;
export const PHASE_PRESETS: { key: string; label: string; v: PresetV }[] = [
  { key: 'cuni', label: 'Cu–Ni: complete solubility (ideal)', v: { a: 'Cu', b: 'Ni', tmA: 1084.6, tmB: 1455, hA: 13.26, hB: 17.48, omegaL: 0, omegaS: 0, omegaL1: 0, omegaS1: 0 } },
  { key: 'pbsn', label: 'Pb–Sn: a eutectic (model fitted to it)', v: { a: 'Pb', b: 'Sn', tmA: 327.5, tmB: 231.9, hA: 4.77, hB: 7.03, omegaL: 4.67, omegaS: 8.5, omegaL1: -0.6, omegaS1: -5.62 } },
  { key: 'agcu', label: 'Ag–Cu: a eutectic (model fitted to it)', v: { a: 'Ag', b: 'Cu', tmA: 961.8, tmB: 1084.6, hA: 11.3, hB: 13.26, omegaL: 12.39, omegaS: 24.6, omegaL1: -1.06, omegaS1: -4.25 } },
  { key: 'sym', label: 'Symmetric eutectic (teaching)', v: { a: 'A', b: 'B', tmA: 1000, tmB: 1000, hA: 15, hB: 15, omegaL: 0, omegaS: 25, omegaL1: 0, omegaS1: 0 } },
  { key: 'gap', label: 'Au–Ni-like: a minimum, a gap in the solid (model)', v: { a: 'Au', b: 'Ni', tmA: 1064.2, tmB: 1455, hA: 12.55, hB: 17.48, omegaL: 2, omegaS: 18, omegaL1: 0, omegaS1: 0 } },
];
export const PHASE_DEFAULTS: PhaseDiagramData = { preset: 'pbsn', ...PHASE_PRESETS[1].v, unit: 'C', tMin: NaN, tMax: NaN, points: [], alloy: NaN, labels: true };

// the colours of the phases (light, so the lines and texts read over them); two phases: the two mixed, hatched
const PHASE_COLORS: Record<string, string> = { L: '#cfe3f6', α: '#fbdcb8', β: '#cdeccb', 'α₁': '#fbdcb8', 'α₂': '#e6d6f3' };
const LINE_COLORS: Record<string, string> = { liquidus: '#1f4e9c', solidus: '#b2182b', solvus: '#2e7d32' };
const hexRgb = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const mixHex = (cs: string[]) => {
  const rgb = cs.map(hexRgb);
  return `#${[0, 1, 2].map((k) => Math.round(rgb.reduce((s, c) => s + c[k], 0) / rgb.length).toString(16).padStart(2, '0')).join('')}`;
};
const darker = (h: string, f = 0.55) => `#${hexRgb(h).map((v) => Math.round(v * f).toString(16).padStart(2, '0')).join('')}`;
export const phaseColor = (p: string) => PHASE_COLORS[p] ?? '#e0e0e0';
export const regionColor = (phases: string[]) => (phases.length === 1 ? phaseColor(phases[0]) : mixHex(phases.map(phaseColor)));

const K0 = 273.15;
export const modelOf = (d: PhaseDiagramData): PhaseModel => {
  const k = d.unit === 'C' ? K0 : 0;
  return { tmA: d.tmA + k, tmB: d.tmB + k, hA: d.hA * 1000, hB: d.hB * 1000, omegaL: d.omegaL * 1000, omegaS: d.omegaS * 1000, omegaL1: (d.omegaL1 ?? 0) * 1000, omegaS1: (d.omegaS1 ?? 0) * 1000 };
};

export type PhaseOut = {
  diagram: Diagram;
  curves: Curve[];
  annotations: AnnotationItem[];
  cooling?: { curves: Curve[]; annotations: AnnotationItem[]; summary: string[] };
  levers: Lever[];
  points: Dataset;
  fractions?: Dataset;
  boundaries: Dataset;
  summary: string[];
  tUnit: string;
  xName: string;
};

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

// The figure's curves and shapes and the tables, or why not
export function phaseFigures(d: PhaseDiagramData): PhaseOut | string {
  const bad = (['tmA', 'tmB', 'hA', 'hB'] as const).find((k) => !(Number.isFinite(d[k]) && d[k] > (k.startsWith('tm') && d.unit === 'C' ? -K0 : 0)));
  if (bad) return `${{ tmA: `The melting point of ${d.a}`, tmB: `The melting point of ${d.b}`, hA: `The enthalpy of fusion of ${d.a}`, hB: `The enthalpy of fusion of ${d.b}` }[bad]} must be a positive number.`;
  const m = modelOf(d);
  const k = d.unit === 'C' ? K0 : 0;
  const tU = d.unit === 'C' ? '°C' : 'K';
  const toU = (T: number) => T - k;
  const diag = phaseDiagram(m, { ...(Number.isFinite(d.tMin) ? { tMin: d.tMin + k } : {}), ...(Number.isFinite(d.tMax) ? { tMax: d.tMax + k } : {}) });
  const xName = `${d.b} (at%)`;
  const tName = `Temperature (${tU})`;
  const series = (xs: number[], ys: number[], name: string) => ({ name, x: column(xName, Float64Array.from(xs)), y: column(name, Float64Array.from(ys)) });
  const curves: Curve[] = [];
  const annotations: AnnotationItem[] = [];
  const shape = (id: string, spec: object): AnnotationItem => ({ id, type: 'shape', spec: { ...SHAPE_DEFAULTS, coords: 'data', ...spec } });
  const text = (id: string, spec: object): AnnotationItem => ({ id, type: 'text', spec: { ...TEXT_SPEC_DEFAULTS, coords: 'data', ...spec } });

  // the regions, under the data: one phase in its colour; two phases mixed and hatched
  diag.regions.forEach((r, j) => {
    const fill = regionColor(r.phases);
    for (const [q, poly] of r.polys.entries())
      annotations.push(
        shape(`ph-region-${j}-${q}`, {
          kind: 'polygon',
          points: poly.map(([x, T]) => `${(x * 100).toFixed(4)} ${toU(T).toFixed(4)}`).join('; '),
          closed: true,
          fill,
          fillOpacity: 1,
          width: 0,
          z: -2,
          ...(r.phases.length > 1 ? { hatch: '/', hatchColor: darker(fill, 0.8) } : {}),
        }),
      );
    if (d.labels) r.labels.forEach(([x, T], q) => annotations.push(text(`ph-label-${j}-${q}`, { text: r.key, x: x * 100, y: toU(T), anchor: 'c', style: { size: 9, bold: true, color: '#333333' }, z: 1 })));
  });
  // the lines: liquidus, solidus, solvus (one legend entry each)
  const seen = new Set<string>();
  diag.boundaries.forEach((b, j) => {
    if (b.pts.length < 2) return;
    const first = !seen.has(b.key);
    seen.add(b.key);
    curves.push({ key: `ph:${b.key}:${j}`, label: b.key, ...(first ? {} : { noLegend: true }), series: series(b.pts.map((p) => p[0] * 100), b.pts.map((p) => toU(p[1])), b.key), style: curveStyle({ mode: 'line', color: LINE_COLORS[b.key], lineWidth: 1.6 }) });
  });
  // the invariants: a horizontal line between the three phases, its point marked and written
  const summary: string[] = [];
  diag.invariants.forEach((v, j) => {
    const T = toU(v.T);
    curves.push({ key: `ph:inv:${j}`, label: v.kind, ...(j ? { noLegend: true } : {}), series: series([v.xs[0] * 100, v.xs[2] * 100], [T, T], v.kind), style: curveStyle({ mode: 'line', color: '#000000', lineWidth: 1.4 }) });
    curves.push({ key: `ph:invpt:${j}`, label: `${v.kind} point`, noLegend: true, series: series([v.xs[1] * 100], [T], v.kind), style: curveStyle({ mode: 'scatter', color: '#000000', symbol: 'circle', symbolSize: 5, symbolFill: 'filled' }) });
    const name = v.kind === 'eutectic' ? 'E' : v.kind === 'peritectic' ? 'P' : 'I';
    // written under the line, ending at the point (the points' boxes go above and beside their points)
    annotations.push(text(`ph-inv-${j}`, { text: `${name}  ${fmt(T)} ${tU}, ${fmt(v.xs[1] * 100)} at% ${d.b}`, x: v.xs[1] * 100 - 1, y: T, anchor: 'tr', style: { size: 7.5, color: '#000000' }, box: 'fill', boxColor: '#ffffff', padding: 1.5, z: 3 }));
    summary.push(`${v.kind[0].toUpperCase()}${v.kind.slice(1)}: ${fmt(T)} ${tU}, ${v.phases.join(' + ')} at ${v.xs.map((x) => fmt(x * 100)).join(', ')} at% ${d.b} (L → ${v.phases.filter((p) => p !== diag.nameOf('L', 0.5, v.T + 1)).join(' + ')}).`);
  });
  // the pure components at the edges
  annotations.push(text('ph-A', { text: d.a, coords: 'percent', x: 0, y: 0, anchor: 'tl', style: { size: 9, bold: true }, padding: 2, z: 3 }));
  annotations.push(text('ph-B', { text: d.b, coords: 'percent', x: 100, y: 0, anchor: 'tr', style: { size: 9, bold: true }, padding: 2, z: 3 }));

  // the lever rule at every point: the tie line, its ends, the point; the phases and amounts written beside it
  const levers: Lever[] = [];
  const rowsP: { k: number; x: number; T: number; ph: Lever['phases'] }[] = [];
  d.points.forEach(([xp, Tp], q) => {
    if (!Number.isFinite(xp) || !Number.isFinite(Tp)) return;
    const x = Math.min(100, Math.max(0, xp)) / 100;
    const lv = lever(m, x, Tp + k, diag.nameOf);
    levers.push(lv);
    rowsP.push({ k: q + 1, x: xp, T: Tp, ph: lv.phases });
    const color = PALETTE[(q + 1) % PALETTE.length];
    if (lv.phases.length === 2) {
      const [p1, p2] = lv.phases;
      curves.push({ key: `ph:tie:${q}`, label: `point ${q + 1}`, noLegend: true, series: series([p1.x * 100, p2.x * 100], [Tp, Tp], `tie ${q + 1}`), style: curveStyle({ mode: 'linesymbol', color, lineWidth: 1.4, symbol: 'circle', symbolSize: 4.5, symbolFill: 'white', symbolEdge: 1.2 }) });
    }
    curves.push({ key: `ph:pt:${q}`, label: `point ${q + 1}`, noLegend: true, series: series([xp], [Tp], `point ${q + 1}`), style: curveStyle({ mode: 'scatter', color, symbol: 'diamond', symbolSize: 6, symbolFill: 'filled' }) });
    const lines = lv.phases.map((p) => `${p.name}: ${fmt(p.x * 100)} at% ${d.b}, ${fmt(p.f * 100)} %`);
    annotations.push(text(`ph-pt-${q}`, { text: `${q + 1}  ${lines.join('\n')}`, x: xp, y: Tp, anchor: xp > 60 ? 'br' : 'bl', style: { size: 7, color: '#000000' }, box: 'both', boxColor: '#ffffff', borderColor: color, borderWidth: 0.8, padding: 2, z: 4 }));
  });
  const textCol = (name: string, vals: string[]): Column => column(name, new Float64Array(vals.length).fill(NaN), vals);
  const points: Dataset = {
    name: 'lever rule',
    columns: [
      column('Point', Float64Array.from(rowsP, (r) => r.k)),
      column(`x (at% ${d.b})`, Float64Array.from(rowsP, (r) => r.x)),
      column(tName, Float64Array.from(rowsP, (r) => r.T)),
      textCol('Phase 1', rowsP.map((r) => r.ph[0]?.name ?? '')),
      column(`x1 (at% ${d.b})`, Float64Array.from(rowsP, (r) => (r.ph[0] ? r.ph[0].x * 100 : NaN))),
      column('Amount 1 (%)', Float64Array.from(rowsP, (r) => (r.ph[0] ? r.ph[0].f * 100 : NaN))),
      textCol('Phase 2', rowsP.map((r) => r.ph[1]?.name ?? '')),
      column(`x2 (at% ${d.b})`, Float64Array.from(rowsP, (r) => (r.ph[1] ? r.ph[1].x * 100 : NaN))),
      column('Amount 2 (%)', Float64Array.from(rowsP, (r) => (r.ph[1] ? r.ph[1].f * 100 : NaN))),
    ],
  };

  // the alloy cooled: a line down the diagram, its liquidus and solidus marked; the amounts of its phases
  let coolOut: PhaseOut['cooling'];
  let fractions: Dataset | undefined;
  if (Number.isFinite(d.alloy) && d.alloy > 0 && d.alloy < 100) {
    const x = d.alloy / 100;
    const c = cooling(m, x, diag, diag.tMax, diag.tMin, 400);
    curves.push({ key: 'ph:alloy', label: `alloy ${fmt(d.alloy)} at% ${d.b}`, noLegend: true, series: series([d.alloy, d.alloy], [toU(diag.tMax), toU(diag.tMin)], 'alloy'), style: curveStyle({ mode: 'line', color: '#555555', lineWidth: 1, dash: 'dash' }) });
    const marks: [string, number | undefined][] = [
      ['first solid', c.liquidus],
      ['last liquid', c.solidus],
    ];
    marks.forEach(([nm, T], j) => {
      if (T === undefined) return;
      curves.push({ key: `ph:mark:${j}`, label: nm, noLegend: true, series: series([d.alloy], [toU(T)], nm), style: curveStyle({ mode: 'scatter', color: '#555555', symbol: 'square', symbolSize: 4, symbolFill: 'filled' }) });
    });
    const names = Object.keys(c.frac).filter((p) => c.frac[p].some((f) => f > 1e-9));
    // in the order: the liquid, then the solids left to right
    const L = diag.nameOf('L', 0.5, diag.tMax);
    names.sort((p, q) => (p === L ? -1 : q === L ? 1 : p.localeCompare(q)));
    const Tu = c.T.map(toU);
    const cc: Curve[] = [];
    const acc = new Float64Array(Tu.length);
    names.forEach((p, j) => {
      c.frac[p].forEach((f, i) => (acc[i] += f * 100));
      const col = phaseColor(p);
      cc.push({
        // the key ends with its number: a fill to curve j finds the one before it
        key: `cool:${j}`,
        label: p,
        series: { name: p, x: column(tName, Float64Array.from(Tu)), y: column(`${p} (%)`, Float64Array.from(acc)) },
        style: curveStyle({ mode: 'line', color: darker(col), lineWidth: 1.2, fill: j === 0 ? 'zero' : 'curve', fillCurve: j, fillColor: col, fillOpacity: 1 }),
      });
    });
    const cAnn: AnnotationItem[] = [];
    const vline = (id: string, T: number, label: string) => {
      cAnn.push(shape(`cool-${id}`, { kind: 'vline', x1: toU(T), x2: toU(T), color: '#555555', width: 0.8, dash: 'dash', z: 2 }));
      cAnn.push(text(`cool-${id}-t`, { text: `${label}\n${fmt(toU(T))} ${tU}`, x: toU(T), y: 100, anchor: 'tl', style: { size: 7 }, box: 'fill', boxColor: '#ffffff', padding: 1, z: 3 }));
    };
    if (c.liquidus !== undefined) vline('liq', c.liquidus, 'first solid');
    if (c.solidus !== undefined) vline('sol', c.solidus, c.atInvariant ? 'eutectic' : 'last liquid');
    const cs: string[] = [`Alloy ${fmt(d.alloy)} at% ${d.b}: the first solid at ${c.liquidus !== undefined ? `${fmt(toU(c.liquidus))} ${tU}` : '—'}, solid from ${c.solidus !== undefined ? `${fmt(toU(c.solidus))} ${tU}` : '—'}.`];
    if (c.atInvariant) {
      const ab = c.atInvariant.above.phases;
      const primary = ab.find((p) => p.name !== L);
      const liq = ab.find((p) => p.name === L);
      if (primary && liq) cs.push(`Just above the eutectic: ${fmt(primary.f * 100)} % primary ${primary.name} (${fmt(primary.x * 100)} at% ${d.b}) and ${fmt(liq.f * 100)} % liquid, which becomes the eutectic (${c.atInvariant.below.phases.map((p) => `${p.name} ${fmt(p.f * 100)} %`).join(', ')} in all just below).`);
    }
    coolOut = { curves: cc, annotations: cAnn, summary: cs };
    fractions = {
      name: `cooling ${fmt(d.alloy)} at% ${d.b}`,
      columns: [column(tName, Float64Array.from(Tu)), ...names.map((p) => column(`${p} (%)`, Float64Array.from(c.frac[p], (f) => f * 100))), ...names.map((p) => column(`x ${p} (at% ${d.b})`, Float64Array.from(c.comp[p], (v) => v * 100)))],
    };
    summary.push(...cs);
  }
  const bRows = diag.boundaries.flatMap((b) => b.pts.map((p) => ({ key: b.key, x: p[0] * 100, T: toU(p[1]) })));
  const boundaries: Dataset = { name: 'boundaries', columns: [textCol('Line', bRows.map((r) => r.key)), column(xName, Float64Array.from(bRows, (r) => r.x)), column(tName, Float64Array.from(bRows, (r) => r.T))] };
  return { diagram: diag, curves, annotations, ...(coolOut ? { cooling: coolOut } : {}), levers, points, ...(fractions ? { fractions } : {}), boundaries, summary, tUnit: tU, xName };
}
