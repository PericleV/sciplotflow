// Example projects (Examples menu): complete graphs that show how the nodes work together.
import { peakRunKey } from './engine/peaks.ts';
import type { Edge } from '@xyflow/react';
import { REGION_COLORS } from './nodes/regionColors.ts';
import { DRAWING_DEFAULTS, PYTHON_DEFAULTS, CONVERT_DEFAULTS, STACK_DEFAULTS, TRANSPOSE_DEFAULTS, COLUMNS_DEFAULTS, FILTER_DEFAULTS, CLEAN_DEFAULTS, DATAMANIP_DEFAULTS, AVERAGE_DEFAULTS, COMBINE_DEFAULTS, TRANSLATE_DEFAULTS, CURVEMATH_DEFAULTS, DIGITIZER_DEFAULTS, PHASE_DIGITIZER_DEFAULTS, EIS_DEFAULTS, PEAKWIDTH_DEFAULTS, MATRIX_DEFAULTS, MATRIX_CONTOUR_DEFAULTS, SMOOTH_DEFAULTS, INTERP_DEFAULTS, NORMALIZE_DEFAULTS, FFT_DEFAULTS, CONV_DEFAULTS, ANOVA_DEFAULTS, CORR_DEFAULTS, PADJUST_DEFAULTS, CONTINGENCY_DEFAULTS, ROC_DEFAULTS, SURVIVAL_DEFAULTS, REGRESS_DEFAULTS, POWER_DEFAULTS, RESAMPLE_DEFAULTS, DISTFIT_DEFAULTS, AGREE_DEFAULTS, METHCOMP_DEFAULTS, LOGISTIC_DEFAULTS, NONPAR_DEFAULTS, NORM_DEFAULTS, TTEST_DEFAULTS, CALCULUS_DEFAULTS, PEAK_DEFAULTS, WORKBOOK_DEFAULTS, PICK_DEFAULTS, CANVAS_DEFAULTS, CANVAS_LAYOUT_DEFAULTS, UNSTACK_DEFAULTS, EXTRACT_DEFAULTS, FIT_DEFAULTS, GENCOL_DEFAULTS, BARCHART_DEFAULTS, HISTOGRAM_DEFAULTS, BOXVIOLIN_DEFAULTS, PROBPLOT_DEFAULTS, BLANDALTMAN_DEFAULTS, PIE_DEFAULTS, CONTOUR_DEFAULTS, POLAR_DEFAULTS, SCATTERMATRIX_DEFAULTS, TERNARY_DEFAULTS, WATERFALL_DEFAULTS, PLOT3D_DEFAULTS, IMPORT_DEFAULTS, MATHCOL_DEFAULTS, IMAGE_DEFAULTS, KK_DEFAULTS, NOTE_DEFAULTS, PLOT1D_DEFAULTS, PLOT_PAGE_DEFAULTS, STATS_DEFAULTS } from './defaults.ts';
import { INSET_DEFAULTS, AXES_STYLE_DEFAULTS, AXIS_DEFAULTS, COLORBAR_DEFAULTS, CURVE_STYLE_DEFAULTS, LEGEND_STYLE_DEFAULTS, PALETTE, SHAPE_DEFAULTS, SIDE_DEFAULTS, TEXT_SPEC_DEFAULTS, type AxesStyle, type CurveStyle, type SideStyle } from './figure/spec.ts';
import { PROJECT_VERSION, type Project } from './project.ts';
import type { AnnotationItem, AppNode, ImportSheet, NodeType, Plot1DData, PlotLegend, PlotPage } from './types.ts';
import type { FitParamSpec } from './engine/fit.ts';
import { SC_D, SC_LAMBDA, SC_R } from './data/strongCoupling.ts';
import { JOHNSON_AU } from './data/johnsonGold.ts';
import { makeGroup } from './engine/subgraph.ts';
import { FRAME_COLORS } from './nodeColors.ts';
import { packPixels, type Raster } from './image/raster.ts';
import { eisPlotData, eisPlotEdges } from './eisPlots.ts';
import type { Roi } from './image/roi.ts';
import { afmImage, clustersImage, cubesImage, hrtemImage, monolayerImage, porousImage, saedImage, shapesImage, textureImage, type TestImage } from './image/testImages.ts';
import { findLike, fitBox, MATCH_DEFAULTS } from './image/match.ts';
import { applySteps, newStep, type ImgStep } from './image/steps.ts';
import { findParticles, PARTICLE_DEFAULTS, SHAPE_COLORS, shapeFeatures, shapeName, tracedPerimeter } from './image/particles.ts';
import { CLASS_COLORS, trainingExamples } from './image/classify.ts';

type Builder = { nodes: AppNode[]; edges: Edge[] };
const builder = (): Builder => ({ nodes: [], edges: [] });
function add<T extends NodeType>(b: Builder, type: T, id: string, x: number, y: number, data: Extract<AppNode, { type: T }>['data']): string {
  const d = structuredClone(data) as Record<string, unknown>;
  // a Peak analyzer of an example: shown fitted (as if Run analysis had been pressed)
  if (type === 'peaks' && d.needRun && !d.ran) d.ran = peakRunKey(d);
  b.nodes.push({ id, type, position: { x, y }, data: d } as AppNode);
  return id;
}
function link(b: Builder, source: string, target: string, targetHandle: string, sourceHandle = 'out') {
  b.edges.push({ id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle });
}
// A 1D plot: its curves, axes, legend (hidden when not given), annotations and page.
type Figure = { axes?: Partial<AxesStyle>; legend?: Partial<PlotLegend>; notes?: AnnotationItem[]; page?: Partial<PlotPage> };
const plot = (curves: Omit<Plot1DData, 'axes' | 'legend' | 'annotations' | 'page'>, f: Figure = {}): Plot1DData => ({
  ...curves,
  axes: f.axes ? axes(f.axes) : undefined,
  legend: f.legend ? { ...PLOT1D_DEFAULTS.legend!, ...f.legend, show: true } : { show: false },
  annotations: f.notes ?? [],
  page: { ...PLOT_PAGE_DEFAULTS, ...f.page },
});
const note = <T extends AnnotationItem['type']>(id: string, type: T, spec: object): AnnotationItem => ({ id, type, spec }) as AnnotationItem;
const project = (b: Builder, name: string): Project => ({ app: 'graph-flow', version: PROJECT_VERSION, nodes: b.nodes, edges: b.edges, name });
const curve = (k: number, patch: Partial<CurveStyle> = {}): CurveStyle => ({ ...CURVE_STYLE_DEFAULTS, color: PALETTE[k], ...patch });
const side = (patch: Partial<SideStyle> = {}): SideStyle => ({ ...SIDE_DEFAULTS, ...patch });
function axes(patch: Partial<AxesStyle> = {}): AxesStyle {
  return { ...AXES_STYLE_DEFAULTS, ...patch };
}

// A seeded generator (the example data are the same every time).
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// An instrument export: two header lines to skip, names and units (written into the names), semicolons and decimal commas — an absorbance
// spectrum of gold nanoparticles (plasmon band near 520 nm) measured three times.
function uvvisFile(): string {
  const r = rng(7);
  const lines = ['UV-Vis spectrometer export;;;', 'Sample: Au nanoparticles, 20 nm, 1 cm cuvette;;;', 'Wavelength;A1;A2;A3', 'nm;a.u.;a.u.;a.u.'];
  for (let w = 400; w <= 700; w += 5) {
    const base = 0.35 * Math.exp(-(w - 400) / 140) + 0.62 * Math.exp(-(((w - 521) / 38) ** 2)) + 0.04;
    const reps = [0, 1, 2].map(() => (base * (1 + 0.012 * gauss(r)) + 0.006 * gauss(r)).toFixed(4).replace('.', ','));
    lines.push([String(w), ...reps].join(';'));
  }
  return lines.join('\r\n');
}

function spectrumExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'import-uv', 0, 0, { ...IMPORT_DEFAULTS, fileName: 'AuNP_uvvis.csv', text: uvvisFile(), textId: 'example', csv: { ...IMPORT_DEFAULTS.csv, skip: 2, nameLine: 1, unitLine: 2 } });
  // the three replicates of every wavelength: mean ± SD (a dataset: Wavelength X, Mean Y, SD ±Y)
  const rows = add(b, 'stats', 'replicates', 640, 0, { ...STATS_DEFAULTS, on: 'rows', cols: 'A1-A3', err: 'sd' });
  link(b, imp, rows, 'in');
  // the statistics of each replicate over the plasmon band (500–560 nm)
  const stats = add(b, 'stats', 'stats-band', 640, 820, { cols: 'A1-A3', rows: { mode: 'range', by: 'x', ranges: [{ from: 500, to: 560 }] } });
  link(b, imp, stats, 'in');
  // an arrow on the plasmon band, in the units of the data (it stays on the peak whatever the limits), and its label
  const p1 = add(
    b,
    'plot1d',
    'plot-mean',
    1160,
    0,
    plot(
      { label: 'mean ± SD (n = 3)', style: curve(1, { mode: 'linesymbol', symbol: 'circle', symbolSize: 3.5, lineWidth: 0.8, errCap: 2.5 }), cols: { x: 'Wavelength (nm)', y: 'Mean', yerr: 'SD' } },
      {
        axes: {
          x: { ...AXES_STYLE_DEFAULTS.x, min: 400, max: 700, minor: 1 },
          y: { ...AXES_STYLE_DEFAULTS.y, range: 'padded' },
          // the top axis shows the photon energy of the bottom wavelengths: E [eV] = 1239.84 / λ [nm]
          top: { mode: 'function', scale: { ...AXES_STYLE_DEFAULTS.x, step: 0.25, minor: 0 }, fn: '1239.84/x' },
          sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Wavelength λ (nm)' }), left: side({ title: 'Absorbance (a.u.)' }), top: side({ title: 'Photon energy (eV)', minorTicks: false }) },
        },
        legend: { x: 3, y: 30, anchor: 'tl' },
        notes: [
          note('arrow-lspr', 'shape', { ...SHAPE_DEFAULTS, kind: 'arrow', coords: 'data', x1: 590, y1: 0.72, x2: 535, y2: 0.78, width: 0.75, headSize: 5 }),
          note('text-lspr', 'text', { ...TEXT_SPEC_DEFAULTS, text: 'LSPR\nλ_{max} ≈ 520 nm', coords: 'data', x: 593, y: 0.72, anchor: 'cl', style: { size: 7 } }),
        ],
        page: { name: 'AuNP_absorbance' },
      },
    ),
  );
  link(b, rows, p1, 'dataset');
  return project(b, 'UV-Vis spectrum: mean ± SD of three measurements');
}

function generatedExample(): Project {
  const b = builder();
  const t = add(b, 'gencol', 'gen-t', 0, 0, { ...GENCOL_DEFAULTS, name: 'Time (ns)', mode: 'linspace', count: 301, start: 0, stop: 10 });
  const model = add(b, 'mathcol', 'model', 420, 0, { ...MATHCOL_DEFAULTS, formula: 'exp(-A/3)*cos(2*pi*A/1.6)', name: 'Signal (mV)' });
  link(b, t, model, 'in-0');
  const env = add(b, 'mathcol', 'envelope', 420, 300, { ...MATHCOL_DEFAULTS, formula: 'exp(-A/3)', name: 'Envelope (mV)' });
  link(b, t, env, 'in-0');
  const ts = add(b, 'gencol', 'gen-ts', 0, 520, { ...GENCOL_DEFAULTS, name: 'Time (ns)', mode: 'linspace', count: 41, start: 0, stop: 10 });
  const noise = add(b, 'gencol', 'gen-noise', 420, 560, { ...GENCOL_DEFAULTS, name: 'noise (mV)', mode: 'random', dist: 'normal', a: 0, b: 0.06, seed: 3 });
  link(b, ts, noise, 'like');
  const meas = add(b, 'mathcol', 'measured', 840, 520, { ...MATHCOL_DEFAULTS, formula: 'exp(-A/3)*cos(2*pi*A/1.6) + B', name: 'Measured (mV)' });
  link(b, ts, meas, 'in-0');
  link(b, noise, meas, 'in-1');
  // one Plot, three curves: the measured points have their own X (41 points), the envelope shares the X of the model
  const p = add(
    b,
    'plot1d',
    'plot-osc',
    1260,
    0,
    plot(
      {
        label: 'model',
        style: curve(1, { lineWidth: 1 }),
        rows: [
          { label: 'envelope e^{−t/τ}', style: curve(0, { lineWidth: 0.75, dash: 'dash' }) },
          { label: 'measured', style: curve(2, { mode: 'scatter', symbol: 'circle', symbolFill: 'open', symbolSize: 4, symbolEdge: 0.8 }) },
        ],
      },
      {
        axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 0, max: 10 }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Time \\italic{t} (ns)' }), left: side({ title: 'Signal (mV)' }) } },
        legend: { x: 96, y: 4, anchor: 'tr', frame: 'line' },
        page: { name: 'damped_oscillation' },
      },
    ),
  );
  link(b, t, p, 'x');
  link(b, model, p, 'y');
  link(b, env, p, 'y-1');
  link(b, ts, p, 'x-2');
  link(b, meas, p, 'y-2');
  return project(b, 'Generated data: a damped oscillation and noisy samples');
}

// Two panels: points coloured by their y value with a colour bar, and the same data cleaned by Math column rules; a Merge
// puts the two Plots side by side.
function panelsExample(): Project {
  const b = builder();
  const x = add(b, 'gencol', 'gen-x', 0, 0, { ...GENCOL_DEFAULTS, name: 'Temperature (°C)', mode: 'linspace', count: 60, start: 20, stop: 80 });
  const noise = add(b, 'gencol', 'gen-n', 0, 420, { ...GENCOL_DEFAULTS, name: 'noise', mode: 'random', dist: 'normal', a: 0, b: 0.03, seed: 11 });
  link(b, x, noise, 'like');
  // a melting curve with noise and two spikes (rows 12 and 37)
  const y = add(b, 'mathcol', 'signal', 420, 0, { ...MATHCOL_DEFAULTS, formula: '1/(1 + exp(-(A - 50)/6)) + B + if(i == 12 or i == 37, 0.6, 0)', name: 'Fraction unfolded' });
  link(b, x, y, 'in-0');
  link(b, noise, y, 'in-1');
  // the two spikes removed: those rows become empty, the others stay
  const clean = add(b, 'mathcol', 'clean', 840, 0, { ...MATHCOL_DEFAULTS, name: 'Fraction unfolded (cleaned)', formula: 'A', rules: [{ mode: 'rows', rows: '12, 37', formula: 'NaN' }] });
  link(b, y, clean, 'in-0');
  const common = { x: { ...AXES_STYLE_DEFAULTS.x, min: 20, max: 80 }, y: { ...AXES_STYLE_DEFAULTS.y, range: 'padded' as const } };
  const sides = { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Temperature (\\deg C)' }), left: side({ title: 'Fraction unfolded' }) };
  const pa = add(
    b,
    'plot1d',
    'plot-a',
    1300,
    0,
    plot(
      { label: 'measured', style: curve(0, { mode: 'scatter', symbol: 'circle', symbolSize: 4.5, symbolEdge: 0.3, edgeColor: '#333333', colorBy: 'y', cmap: 'viridis' }) },
      { axes: { ...common, sides }, notes: [note('cbar', 'colorbar', { ...COLORBAR_DEFAULTS, x: 103, y: 0, length: 100, thickness: 5, title: 'f' })], page: { name: 'melting_a' } },
    ),
  );
  link(b, x, pa, 'x');
  link(b, y, pa, 'y');
  const pb = add(
    b,
    'plot1d',
    'plot-b',
    1300,
    1300,
    plot(
      { label: 'cleaned', style: curve(1, { mode: 'linesymbol', connect: 'spline', symbol: 'square', symbolSize: 3, symbolFill: 'white', symbolEdge: 0.7 }) },
      {
        axes: { ...common, sides },
        notes: [
          note('band', 'shape', { ...SHAPE_DEFAULTS, kind: 'xband', coords: 'data', x1: 44, x2: 56, color: '#E69F00', fillOpacity: 0.18, z: -1 }),
          note('tm', 'text', { ...TEXT_SPEC_DEFAULTS, text: '\\italic{T}_{m}', coords: 'data', x: 50, y: 0.05, anchor: 'bc' }),
        ],
        page: { name: 'melting_b' },
      },
    ),
  );
  link(b, x, pb, 'x');
  link(b, clean, pb, 'y');
  // the two Plots side by side, one Y range, the numbers of the inner axis left out
  const cv = add(b, 'canvas', 'canvas-2', 2000, 0, { ...CANVAS_DEFAULTS, width: 180, height: 70, panels: '(a)', name: 'melting_two_panels', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 2, shareY: 'row', inner: false } });
  link(b, pa, cv, 'figures', 'figure');
  link(b, pb, cv, 'figures', 'figure');
  return project(b, 'Two panels: colour by value, colour bar, spikes removed');
}

// Three quantities of one run on three Y axes, and an X axis with a break over the hours without data.
// A cyclic voltammogram as a potentiostat exports it: one table, the potential going from −0.2 V to 0.8 V and back, three
// cycles; the current: the double layer (± a constant) plus an oxidation peak going up and a reduction peak coming down,
// a little smaller every cycle.
function cvFile(): string {
  const r = rng(11);
  const lines = ['Potential (V)\tCurrent (mA)'];
  const peak = (e: number, e0: number, w: number) => Math.exp(-(((e - e0) / w) ** 2));
  for (let c = 0; c < 3; c++) {
    const decay = 1 - 0.07 * c;
    for (const [a, b] of [
      [-0.2, 0.8],
      [0.8, -0.2],
    ]) {
      const up = b > a;
      for (let k = 0; k < 200; k++) {
        const e = a + ((b - a) * k) / 200;
        const i = (up ? 0.12 : -0.12) + (up ? 0.9 * decay * peak(e, 0.36, 0.07) : -0.8 * decay * peak(e, 0.29, 0.07)) + 0.004 * gauss(r);
        lines.push(`${e.toFixed(4)}\t${i.toFixed(5)}`);
      }
    }
  }
  lines.push(`${(-0.2).toFixed(4)}\t${(0.12).toFixed(5)}`);
  return lines.join('\n');
}

// A Raman-like spectrum: a peak at 1350, and at 1580 a Lorentzian with a weaker Gaussian at 1620 in its side (a
// shoulder), over a sloping baseline, with noise.
function overlapFile(): string {
  const r = rng(11);
  const G = (x: number, c: number, w: number) => Math.exp((-4 * Math.LN2 * (x - c) ** 2) / (w * w));
  const L = (x: number, c: number, w: number) => 1 / (1 + ((2 * (x - c)) / w) ** 2);
  const lines = ['Raman shift (cm⁻¹);Intensity (a.u.)'];
  for (let x = 1000; x <= 1800; x += 2) {
    const y = 0.15 + 0.0002 * (x - 1000) + G(x, 1350, 60) + 0.8 * L(x, 1580, 40) + 0.45 * G(x, 1625, 45) + 0.012 * gauss(r);
    lines.push(`${x};${y.toFixed(4)}`);
  }
  return lines.join('\n');
}

function overlapExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'ov-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'spectrum', fileName: 'raman.txt', text: overlapFile(), textId: 'ov-1' });
  // the baseline fitted with the peaks and subtracted; the peak at 1625 hides in the side of the one at 1580: added to the
  // list by hand (+ Peak in the shoulder), every peak with its shape
  const pk = add(b, 'peaks', 'ov-peaks', 640, 0, {
    ...PEAK_DEFAULTS,
    baseline: 'linear',
    subtract: true,
    peaks: [
      { shape: 'gauss', x: 1350 },
      { shape: 'lorentz', x: 1580 },
      { shape: 'gauss', x: 1625 },
    ],
  });
  link(b, imp, pk, 'in');
  const X = 'Raman shift (cm⁻¹)';
  const peakRow = (k: number) => ({ label: `peak ${k}`, style: curve(1, { color: REGION_COLORS[k - 1], lineWidth: 1.2, fill: 'zero' as const, fillOpacity: 0.25 }), cols: { x: X, y: `peak ${k}` } });
  const pl = add(b, 'plot1d', 'ov-plot', 1300, 0, {
    ...plot(
      {
        label: 'data − baseline',
        style: curve(1, { mode: 'scatter', color: '#7f7f7f', symbol: 'circle', symbolSize: 2.5 }),
        cols: { x: X, y: 'Intensity (a.u.) − baseline' },
        rows: [peakRow(1), peakRow(2), peakRow(3), { label: 'envelope (sum)', style: curve(1, { color: '#111111', lineWidth: 1.4 }), cols: { x: X, y: 'envelope' } }],
      },
      { legend: { x: 96, y: 4, anchor: 'tr' }, axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 1000, max: 1800 }, y: { ...AXES_STYLE_DEFAULTS.y, min: -0.1, max: 1.7 } }, page: { name: 'peaks' } },
    ),
  });
  link(b, pk, pl, 'dataset', 'out');
  // the table of the peaks in a workbook
  const wb = add(b, 'book', 'ov-table', 1300, 900, { ...WORKBOOK_DEFAULTS, name: 'peaks', sheets: [], into: ['peaks'] });
  link(b, pk, wb, 'in-0', 'table');
  add(b, 'note', 'ov-note', -560, 0, {
    text: 'Peak deconvolution: overlapping peaks separated by fitting them together as a sum.\n\nPeak analyzer: a linear baseline fitted with the peaks and subtracted; peak 1 (Gaussian) at 1350, peak 2 (Lorentzian) at 1580 and peak 3 (Gaussian) hidden in its side at 1625 — added to the list by hand (+ Peak, a click in the shoulder) or found with “shoulders”.\n\nOutputs: the data (data − baseline, every peak, the envelope) → a Plot with the peaks filled in their colours; the table of the peaks (center, height, FWHM, area, area %) → a Workbook.',
  });
  return project(b, 'Overlapping peaks: peak deconvolution');
}

// A drug study in the three layouts the statistics nodes read: one factor (each dose a column), two factors (indexed:
// a value, the dose and the sex of every animal), repeated measures (a row per subject, a column per time).
function drugFiles(): { columns: string; indexed: string; subjects: string } {
  const r = rng(23);
  const doses = ['Control', '10 mg', '20 mg', '40 mg'];
  const mu = [5.0, 5.6, 6.8, 7.9];
  const cols = doses.map((_, k) => Array.from({ length: 8 }, () => (mu[k] + 0.8 * gauss(r)).toFixed(2)));
  const columns = [doses.map((d) => `Response, ${d}`).join(';').replace(/Response, /g, ''), ...Array.from({ length: 8 }, (_, i) => cols.map((c) => c[i]).join(';'))].join('\n');
  const lines = ['Response;Dose;Sex'];
  for (const [k, d] of ['Control', '20 mg', '40 mg'].entries())
    for (const sex of ['F', 'M'])
      for (let i = 0; i < 6; i++) lines.push(`${(5 + 1.3 * k + (sex === 'M' ? 0.6 : 0) + (sex === 'M' && k === 2 ? 0.7 : 0) + 0.7 * gauss(r)).toFixed(2)};${d};${sex}`);
  const subj = ['Subject;Before;1 h;24 h'];
  for (let i = 1; i <= 10; i++) {
    const base = 120 + 12 * gauss(r);
    subj.push(`S${i};${base.toFixed(1)};${(base - 9 + 5 * gauss(r)).toFixed(1)};${(base - 4 + 5 * gauss(r)).toFixed(1)}`);
  }
  return { columns, indexed: lines.join('\n'), subjects: subj.join('\n') };
}

// A clinical study made here: 120 patients in two arms. Survival (Kaplan–Meier, log-rank, the hazard ratio) drawn as
// steps with the censored times; a biomarker (and the age) against the response (ROC, the best threshold); the arm
// against the response (a contingency table, the odds ratio); the tumour size against age, marker and stage (linear
// regression), its coefficients' p adjusted (Holm)
// A laboratory made here: two analyzers on the same 50 samples (Passing–Bablok and Deming, Lin's concordance); three
// pathologists grading 60 biopsies and scoring them (Cohen's and Fleiss's κ, the ICC); the lifetimes of 40 sensors
// (distributions fitted, the bootstrap interval of the median life); a dose and the response of 160 animals (logistic
// regression, its ROC curve); the size of the next study (Power & sample size)
function labExample(): Project {
  const b = builder();
  const r = rng(1009);
  const m = ['Sample;Analyzer A;Analyzer B'];
  for (let i = 0; i < 50; i++) {
    const c = 2 + 18 * r();
    m.push(`S${i + 1};${(c + 0.3 * gauss(r)).toFixed(2)};${(0.4 + 1.05 * c + 0.35 * gauss(r) * (1 + 0.04 * c)).toFixed(2)}`);
  }
  const grades = ['mild', 'moderate', 'severe'];
  const g = ['Biopsy;Pathologist 1;Pathologist 2;Pathologist 3;Score 1;Score 2;Score 3'];
  for (let i = 0; i < 60; i++) {
    const t = 1 + 8 * r();
    const grade = (s: number) => grades[Math.min(2, Math.max(0, Math.floor((s - 1) / 3)))];
    const s = [0, 1, 2].map((k) => t + (k === 1 ? 0.4 : 0) + 0.9 * gauss(r));
    g.push(`B${i + 1};${s.map(grade).join(';')};${s.map((v) => Math.max(0, v).toFixed(1)).join(';')}`);
  }
  const l = ['Sensor;Life (h)'];
  for (let i = 0; i < 40; i++) l.push(`U${i + 1};${(1200 * (-Math.log(1 - r())) ** (1 / 2.2)).toFixed(0)}`);
  const d = ['Animal;Dose (mg/kg);Weight (g);Response'];
  for (let i = 0; i < 160; i++) {
    const dose = [0, 5, 10, 20, 40][i % 5];
    const w = 250 + 30 * gauss(r);
    const eta = -2.4 + 0.11 * dose + 0.006 * (w - 250);
    d.push(`A${i + 1};${dose};${w.toFixed(0)};${r() < 1 / (1 + Math.exp(-eta)) ? 'yes' : 'no'}`);
  }
  const mi = add(b, 'import', 'lab-methods', 0, 0, { ...IMPORT_DEFAULTS, name: 'two analyzers', fileName: 'analyzers.txt', text: m.join('\n'), textId: 'lab-1' });
  const mc = add(b, 'methcomp', 'lab-mc', 680, 0, { ...METHCOMP_DEFAULTS, x: 'Analyzer A', y: 'Analyzer B' });
  link(b, mi, mc, 'in');
  const mp = add(b, 'plot1d', 'lab-mcplot', 1360, 0, {
    ...plot(
      {
        label: 'samples',
        style: dots(0, 3),
        cols: { x: 'Analyzer A', y: 'Analyzer B' },
        rows: [
          { label: 'Passing–Bablok', style: curve(1, { mode: 'line', lineWidth: 1.4 }), cols: { x: 'Analyzer A (line)', y: 'Passing–Bablok' } },
          { label: 'y = x', style: curve(7, { mode: 'line', lineWidth: 0.8, dash: 'dash' }), cols: { x: 'Analyzer A (line)', y: 'Identity (y = x)' } },
        ],
      },
      { axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Analyzer A' }), left: side({ title: 'Analyzer B' }) } }, legend: { x: 4, y: 4, anchor: 'tl' }, page: { name: 'method_comparison' } },
    ),
  });
  link(b, mi, mp, 'dataset');
  link(b, mc, mp, 'dataset', 'line');
  const cc = add(b, 'agree', 'lab-ccc', 680, 900, { ...AGREE_DEFAULTS, mode: 'ccc', cols: 'Analyzer A, Analyzer B' });
  link(b, mi, cc, 'in');
  const gi = add(b, 'import', 'lab-grades', 0, 1500, { ...IMPORT_DEFAULTS, name: 'three pathologists', fileName: 'biopsies.txt', text: g.join('\n'), textId: 'lab-2' });
  const kp = add(b, 'agree', 'lab-kappa', 680, 1500, { ...AGREE_DEFAULTS, mode: 'kappa', cols: 'Pathologist 1, Pathologist 2', weights: 'quadratic' });
  link(b, gi, kp, 'in');
  const fk = add(b, 'agree', 'lab-fleiss', 680, 2200, { ...AGREE_DEFAULTS, mode: 'kappa', cols: 'Pathologist 1, Pathologist 2, Pathologist 3' });
  link(b, gi, fk, 'in');
  const ic = add(b, 'agree', 'lab-icc', 1360, 1500, { ...AGREE_DEFAULTS, mode: 'icc', cols: 'Score 1, Score 2, Score 3' });
  link(b, gi, ic, 'in');
  const li = add(b, 'import', 'lab-life', 0, 3000, { ...IMPORT_DEFAULTS, name: 'sensor lifetimes', fileName: 'lifetimes.txt', text: l.join('\n'), textId: 'lab-3' });
  const df = add(b, 'distfit', 'lab-dist', 680, 3000, { ...DISTFIT_DEFAULTS, col: 'Life (h)', dists: ['normal', 'lognormal', 'weibull', 'gamma', 'exponential'] });
  link(b, li, df, 'in');
  const bs = add(b, 'resample', 'lab-boot', 1360, 3000, { ...RESAMPLE_DEFAULTS, stat: 'median', cols: 'Life (h)' });
  link(b, li, bs, 'in');
  const di = add(b, 'import', 'lab-dose', 0, 4300, { ...IMPORT_DEFAULTS, name: 'dose and response', fileName: 'dose_response.txt', text: d.join('\n'), textId: 'lab-4' });
  const lg = add(b, 'logistic', 'lab-logit', 680, 4300, { ...LOGISTIC_DEFAULTS, y: 'Response', positive: 'yes', xs: 'Dose (mg/kg), Weight (g)' });
  link(b, di, lg, 'in');
  const rc = add(b, 'roc', 'lab-roc', 1360, 4300, { ...ROC_DEFAULTS, truth: 'Observed', positive: 'yes', scores: 'Probability' });
  link(b, lg, rc, 'in', 'fitted');
  const pw = add(b, 'power', 'lab-power', 680, 5600, { ...POWER_DEFAULTS, test: 't2', solve: 'n', effect: 0.6, power: 0.9 });
  const pc = add(b, 'plot1d', 'lab-powerplot', 1360, 5600, plot({ label: 'power', style: curve(0, { mode: 'line', lineWidth: 1.4 }), cols: { x: 'n (per group)', y: 'Power' } }, { page: { name: 'power_curve' } }));
  link(b, pw, pc, 'dataset', 'curve');
  return project(b, 'Laboratory: method comparison, agreement, distributions, power');
}

function clinicalExample(): Project {
  const b = builder();
  const r = rng(911);
  const lines = ['Patient;Arm;Age;Stage;Marker;Response;Tumour (mm);Months;Died'];
  for (let i = 0; i < 120; i++) {
    const arm = i % 2 ? 'New' : 'Standard';
    const age = Math.round(62 + 9 * gauss(r));
    const stage = ['I', 'II', 'III'][Math.min(2, Math.floor(r() * 3))];
    const resp = r() < (arm === 'New' ? 0.62 : 0.4);
    const marker = 3 + (resp ? 1.4 : 0) + 1.1 * gauss(r);
    const tumour = 12 + 0.15 * (age - 60) - 1.6 * marker + { I: 0, II: 4, III: 9 }[stage]! + 3 * gauss(r);
    const t = -Math.log(1 - r()) * (arm === 'New' ? 30 : 18) * (resp ? 1.4 : 1);
    const c = 6 + 42 * r();
    lines.push(`P${i + 1};${arm};${age};${stage};${marker.toFixed(2)};${resp ? 'yes' : 'no'};${Math.max(2, tumour).toFixed(1)};${Math.min(t, c).toFixed(1)};${t <= c ? 1 : 0}`);
  }
  const data = add(b, 'import', 'cl-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'clinical study', fileName: 'clinical_study.txt', text: lines.join('\n'), textId: 'cl-1' });
  const sv = add(b, 'survival', 'cl-surv', 680, 0, { ...SURVIVAL_DEFAULTS, time: 'Months', event: 'Died', group: 'Arm', at: '0, 12, 24, 36, 48' });
  link(b, data, sv, 'in');
  const km = add(b, 'plot1d', 'cl-km', 1360, 0, {
    ...plot(
      {
        label: 'Standard',
        style: curve(0, { mode: 'step', lineWidth: 1.4 }),
        cols: { x: 'Time (Standard)', y: 'Survival (Standard)' },
        rows: [
          { label: 'New', style: curve(1, { mode: 'step', lineWidth: 1.4 }), cols: { x: 'Time (New)', y: 'Survival (New)' } },
          { label: 'censored (Standard)', style: curve(0, { mode: 'scatter', symbol: 'plus', symbolSize: 4 }), cols: { x: 'Censored time (Standard)', y: 'Censored (Standard)' } },
          { label: 'censored (New)', style: curve(1, { mode: 'scatter', symbol: 'plus', symbolSize: 4 }), cols: { x: 'Censored time (New)', y: 'Censored (New)' } },
        ],
      },
      { axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Months' }), left: side({ title: 'Survival' }) } }, legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'kaplan_meier' } },
    ),
  });
  link(b, sv, km, 'dataset', 'curves');
  link(b, sv, km, 'dataset', 'censored');
  const roc = add(b, 'roc', 'cl-roc', 680, 1100, { ...ROC_DEFAULTS, truth: 'Response', positive: 'yes', scores: 'Marker, Age' });
  link(b, data, roc, 'in');
  const rp = add(b, 'plot1d', 'cl-rocplot', 1360, 1100, {
    ...plot(
      { label: 'Marker', style: curve(0, { mode: 'line', lineWidth: 1.4 }), cols: { x: '1 − Specificity (Marker)', y: 'Sensitivity (Marker)' }, rows: [{ label: 'Age', style: curve(2, { mode: 'line', lineWidth: 1.2 }), cols: { x: '1 − Specificity (Age)', y: 'Sensitivity (Age)' } }] },
      { axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: '1 − Specificity' }), left: side({ title: 'Sensitivity' }) } }, legend: { x: 96, y: 96, anchor: 'br' }, page: { name: 'roc' } },
    ),
  });
  link(b, roc, rp, 'dataset', 'curves');
  const ct = add(b, 'contingency', 'cl-ct', 680, 2200, { ...CONTINGENCY_DEFAULTS, rowCol: 'Arm', colCol: 'Response' });
  link(b, data, ct, 'in');
  const rg = add(b, 'regress', 'cl-reg', 680, 3000, { ...REGRESS_DEFAULTS, y: 'Tumour (mm)', xs: 'Age, Marker, Stage' });
  link(b, data, rg, 'in');
  const pa = add(b, 'padjust', 'cl-padj', 1360, 3000, { ...PADJUST_DEFAULTS, method: 'holm' });
  link(b, rg, pa, 'in');
  return project(b, 'Clinical study: survival, ROC, contingency, regression');
}

function drugExample(): Project {
  const b = builder();
  const f = drugFiles();
  // 1. one factor: each dose a column
  const one = add(b, 'import', 'dr-one', 0, 0, { ...IMPORT_DEFAULTS, name: 'one factor', fileName: 'response_by_dose.txt', text: f.columns, textId: 'dr-1' });
  const norm = add(b, 'normality', 'dr-norm', 680, -700, { ...NORM_DEFAULTS });
  link(b, one, norm, 'in');
  const an1 = add(b, 'anova', 'dr-anova1', 680, 0, { ...ANOVA_DEFAULTS, post: 'tukey' });
  link(b, one, an1, 'in');
  const tt = add(b, 'ttest', 'dr-ttest', 680, 900, { ...TTEST_DEFAULTS, cols: 'Control, 40 mg' });
  link(b, one, tt, 'in');
  const kw = add(b, 'nonparam', 'dr-kw', 680, 1600, { ...NONPAR_DEFAULTS, test: 'kruskal', post: 'holm' });
  link(b, one, kw, 'in');
  // the means ± SE of the doses
  const pl = add(b, 'plot1d', 'dr-plot', 1360, 0, {
    ...plot(
      { label: 'mean ± SE (n = 8)', style: curve(1, { mode: 'linesymbol', symbol: 'square', symbolSize: 4.5, lineWidth: 0.8, errCap: 3 }), cols: { x: 'group', y: 'mean', yerr: 'SE' } },
      {
        axes: {
          x: { ...AXES_STYLE_DEFAULTS.x, min: 0.5, max: 4.5, ticksBy: 'values', custom: '1 = Control, 2 = 10 mg, 3 = 20 mg, 4 = 40 mg', minor: 0 },
          sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Dose' }), left: side({ title: 'Response (a.u.)' }) },
        },
        page: { name: 'dose_response' },
      },
    ),
  });
  link(b, an1, pl, 'dataset', 'groups');
  // 2. two factors: indexed
  const two = add(b, 'import', 'dr-two', 0, 2400, { ...IMPORT_DEFAULTS, name: 'two factors', fileName: 'response_dose_sex.txt', text: f.indexed, textId: 'dr-2' });
  const an2 = add(b, 'anova', 'dr-anova2', 680, 2400, { ...ANOVA_DEFAULTS, design: 'two', layout: 'indexed', value: 'Response', factor: 'Dose', factor2: 'Sex', post: 'tukey' });
  link(b, two, an2, 'in');
  // 3. repeated measures: a row per subject
  const rep3 = add(b, 'import', 'dr-rep', 0, 3600, { ...IMPORT_DEFAULTS, name: 'repeated', fileName: 'blood_pressure.txt', text: f.subjects, textId: 'dr-3' });
  const an3 = add(b, 'anova', 'dr-anova3', 680, 3600, { ...ANOVA_DEFAULTS, design: 'repeated', layout: 'subjects', cols: 'Before, 1 h, 24 h', post: 'holm' });
  link(b, rep3, an3, 'in');
  const fr = add(b, 'nonparam', 'dr-friedman', 680, 4500, { ...NONPAR_DEFAULTS, test: 'friedman', layout: 'subjects', cols: 'Before, 1 h, 24 h' });
  link(b, rep3, fr, 'in');
  const co = add(b, 'correl', 'dr-corr', 1360, 3600, { ...CORR_DEFAULTS, cols: 'Before, 1 h, 24 h' });
  link(b, rep3, co, 'in');
  add(b, 'note', 'dr-note', -560, 0, {
    text: 'How the data are laid out for the statistics nodes.\n\n1. One factor — each group a column (Control | 10 mg | 20 mg | 40 mg): Normality, one-way ANOVA with Tukey, a t-test of two of the columns, Kruskal–Wallis; the groups (mean ± SE) of the ANOVA → a Plot.\n\n2. Two factors — indexed: every row one animal, its Response, its Dose and its Sex (text): two-way ANOVA (Dose, Sex, Dose × Sex).\n\n3. Repeated measures — a row per subject, a column per time (Before | 1 h | 24 h): repeated-measures ANOVA (Mauchly, Greenhouse–Geisser), Friedman, correlations.',
  });
  return project(b, 'Drug study: ANOVA, t-test, nonparametric, correlation');
}

// Signals: a noisy spectrum (two peaks), a sampled signal (50 Hz and 120 Hz with noise), a spectrum blurred by the
// instrument, and two curves measured on different X.
function signalFiles() {
  const r = rng(31);
  const L = (x: number, c: number, w: number) => 1 / (1 + ((2 * (x - c)) / w) ** 2);
  const G = (x: number, c: number, w: number) => Math.exp((-4 * Math.LN2 * (x - c) ** 2) / (w * w));
  const noisy = ['Shift (cm⁻¹);Counts'];
  for (let i = 0; i <= 400; i++) {
    const x = 400 + i;
    noisy.push(`${x};${(120 + 900 * L(x, 520, 14) + 500 * L(x, 640, 30) + 35 * gauss(r)).toFixed(1)}`);
  }
  const timed = ['Time (s);Voltage (V)'];
  for (let i = 0; i < 1000; i++) {
    const t = i / 1000;
    timed.push(`${t};${(Math.sin(2 * Math.PI * 50 * t) + 0.5 * Math.sin(2 * Math.PI * 120 * t) + 0.4 * gauss(r)).toFixed(4)}`);
  }
  // two narrow peaks blurred by an instrument of FWHM 1.2 (the convolution done here), with a little noise
  const xs = Array.from({ length: 301 }, (_, i) => i * 0.05);
  const truth = xs.map((x) => G(x, 6.8, 0.3) + 0.7 * G(x, 8, 0.3));
  const k = Array.from({ length: 61 }, (_, i) => G((i - 30) * 0.05, 0, 1.2));
  const ks = k.reduce((a, b) => a + b, 0);
  const blurred = xs.map((_, i) => k.reduce((a, w, j) => a + (w / ks) * (truth[i + 30 - j] ?? 0), 0) + 0.02 + 0.003 * gauss(r));
  const blur = ['Energy (eV);Measured', ...xs.map((x, i) => `${x.toFixed(2)};${blurred[i].toFixed(5)}`)];
  // two curves on their own X (every 0.37 and every 0.8)
  const two = ['xa;ya;xb;yb'];
  for (let i = 0; i < 28; i++) two.push(`${(i * 0.37).toFixed(2)};${(Math.sin(i * 0.37) + 0.02 * gauss(r)).toFixed(4)};${i < 13 ? (i * 0.8).toFixed(2) : ''};${i < 13 ? (0.8 * Math.cos(i * 0.8)).toFixed(4) : ''}`);
  return { noisy: noisy.join('\n'), timed: timed.join('\n'), blur: blur.join('\n'), two: two.join('\n') };
}

function signalExample(): Project {
  const b = builder();
  const f = signalFiles();
  const line = (k: number) => curve(k, { lineWidth: 1.2 });
  const dots = (k: number) => curve(k, { mode: 'scatter', symbol: 'circle', symbolSize: 2, color: '#9a9a9a' });
  // 1. a noisy spectrum: smoothed (Savitzky–Golay), then normalized (maximum = 1)
  const i1 = add(b, 'import', 'sg-noisy', 0, 0, { ...IMPORT_DEFAULTS, name: 'noisy spectrum', fileName: 'raman_noisy.txt', text: f.noisy, textId: 'sg-1' });
  const sm = add(b, 'smooth', 'sg-smooth', 680, 0, { ...SMOOTH_DEFAULTS, method: 'savgol', points: 21, order: 3 });
  link(b, i1, sm, 'in');
  const nm = add(b, 'normalize', 'sg-norm', 1360, 0, { ...NORMALIZE_DEFAULTS, method: 'max', ys: 'Counts (smoothed)' });
  link(b, sm, nm, 'in');
  const p1 = add(b, 'plot1d', 'sg-plot1', 2040, 0, {
    ...plot({ label: 'data', style: dots(0), cols: { x: 'Shift (cm⁻¹)', y: 'Counts' }, rows: [{ label: 'Savitzky–Golay (21 points, degree 3)', style: line(1), cols: { x: 'Shift (cm⁻¹)', y: 'Counts (smoothed)' } }] }, { legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'smoothed' } }),
  });
  link(b, sm, p1, 'dataset');
  // 2. a sampled signal: its spectrum, and a low pass at 80 Hz
  const i2 = add(b, 'import', 'sg-timed', 0, 1500, { ...IMPORT_DEFAULTS, name: 'signal', fileName: 'oscilloscope.txt', text: f.timed, textId: 'sg-2' });
  const sp = add(b, 'fft', 'sg-fft', 680, 1500, { ...FFT_DEFAULTS, mode: 'spectrum', window: 'hann' });
  link(b, i2, sp, 'in');
  const p2 = add(b, 'plot1d', 'sg-plot2', 1360, 1500, { ...plot({ label: 'amplitude', style: line(2), cols: { x: 'Frequency (1/s)', y: 'Voltage (V) amplitude' } }, { axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 0, max: 200 } }, page: { name: 'spectrum' } }) });
  link(b, sp, p2, 'dataset');
  const lp = add(b, 'fft', 'sg-lowpass', 680, 2400, { ...FFT_DEFAULTS, mode: 'filter', filter: 'low', f1: 80, order: 6 });
  link(b, i2, lp, 'in');
  // 3. a spectrum blurred by the instrument: deconvolved (Richardson–Lucy, a Gaussian response of FWHM 1.2)
  const i3 = add(b, 'import', 'sg-blur', 0, 3300, { ...IMPORT_DEFAULTS, name: 'blurred', fileName: 'blurred.txt', text: f.blur, textId: 'sg-3' });
  const dc = add(b, 'convolve', 'sg-deconv', 680, 3300, { ...CONV_DEFAULTS, op: 'rl', shape: 'gauss', fwhm: 1.2, iterations: 60 });
  link(b, i3, dc, 'in');
  const p3 = add(b, 'plot1d', 'sg-plot3', 1360, 3300, {
    ...plot({ label: 'measured (blurred)', style: line(0), cols: { x: 'Energy (eV)', y: 'Measured' }, rows: [{ label: 'deconvolved (Richardson–Lucy)', style: line(1), cols: { x: 'Energy (eV)', y: 'Measured (deconvolved)' } }] }, { legend: { x: 4, y: 4, anchor: 'tl' }, page: { name: 'deconvolved' } }),
  });
  link(b, i3, p3, 'dataset');
  link(b, dc, p3, 'dataset');
  // 4. two curves on their own X, read on a common X (a spline, every 0.1 from 0 to 9.6)
  const i4 = add(b, 'import', 'sg-two', 0, 4600, { ...IMPORT_DEFAULTS, name: 'two grids', fileName: 'two_grids.txt', text: f.two, textId: 'sg-4', edits: { cols: { 0: { role: 'x' }, 1: { role: 'y' }, 2: { role: 'x' }, 3: { role: 'y' } } } });
  const ip = add(b, 'interp', 'sg-interp', 680, 4600, { ...INTERP_DEFAULTS, method: 'spline', grid: 'step', step: 0.1, from: 0, to: 9.6, extrap: 'none' });
  link(b, i4, ip, 'in');
  add(b, 'note', 'sg-note', -560, 0, {
    text: 'Signal processing.\n\n1. A noisy spectrum: Smooth (Savitzky–Golay keeps the height of the peaks), then Normalize (maximum = 1).\n\n2. A sampled signal: FFT spectrum (peaks at 50 Hz and 120 Hz), and an FFT low pass at 80 Hz (only the 50 Hz left).\n\n3. A spectrum blurred by the instrument: Convolution ▸ deconvolve (Richardson–Lucy) separates the two peaks again.\n\n4. Two curves measured on different X: Interpolate reads both on a common X (then Curve math can subtract them).',
  });
  return project(b, 'Signal processing: smooth, FFT, deconvolution, interpolation');
}

function cvExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'cv-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'CV', fileName: 'cv_3cycles.txt', text: cvFile(), textId: 'cv-1' });
  // the cycles side by side (one potential, a current column per cycle), drawn coloured by the cycle
  const cycles = add(b, 'unstack', 'cv-cycles', 640, 0, { ...UNSTACK_DEFAULTS, by: 'cycles' });
  link(b, imp, cycles, 'in');
  const cyc = (k: number) => `Current (mA) · cycle ${k}`;
  const pl = add(b, 'plot1d', 'cv-plot', 1240, 0, {
    ...plot(
      { label: '', style: curve(1, { lineWidth: 1 }), cols: { x: 'Potential (V)', y: cyc(1) }, rows: [2, 3].map((k) => ({ label: '', style: curve(1, { lineWidth: 1 }), cols: { x: 'Potential (V)', y: cyc(k) } })) },
      { legend: { x: 4, y: 4, anchor: 'tl' }, page: { name: 'cv' } },
    ),
    curveColors: { map: 'viridis' },
  });
  link(b, cycles, pl, 'dataset');
  // the pieces where the potential goes one way: going up (1, 3, 5) and coming back (2, 4, 6), each with its own X
  const segs = add(b, 'unstack', 'cv-segments', 640, 1100, { ...UNSTACK_DEFAULTS, by: 'direction', xs: 'each' });
  link(b, imp, segs, 'in');
  // the area between going up and coming back in cycle 1 (segments 1 and 2), absolute, between 0.1 and 0.6 V
  const calc = add(b, 'calculus', 'cv-area', 1240, 1100, { ...CALCULUS_DEFAULTS, op: 'int', ys: 'Current (mA) · segment 1', baseline: 'curve', baseFrom: 'column', baseColumn: 'Current (mA) · segment 2', area: 'abs', regions: [{ lo: 0.1, hi: 0.6 }] });
  link(b, segs, calc, 'in');
  // the peaks and the current at 0.5 V of every segment
  const pk = add(b, 'pick', 'cv-pick', 1900, 1100, { ...PICK_DEFAULTS, rules: [{ kind: 'max', value: '' }, { kind: 'min', value: '' }, { kind: 'x', value: '0.5' }] });
  link(b, segs, pk, 'in');
  add(b, 'note', 'cv-note', -560, 0, {
    text: 'One table, three cycles (the potential goes up and comes back).\n\nSplit into columns ▸ cycles: one potential and a current column per cycle → a Plot coloured by the cycle.\n\nSplit into columns ▸ where X changes direction: the pieces going up (segments 1, 3, 5) and coming back (2, 4, 6), each with its potential.\n\nIntegrate: segment 1 with segment 2 as its baseline — the area between going up and coming back in cycle 1, absolute (nothing subtracted where they cross), between 0.1 and 0.6 V (reg1, hatched).\n\nPick points: the maximum, the minimum and the current at 0.5 V of every segment.',
  });
  return project(b, 'Cyclic voltammogram: area between the branches');
}

function multiAxisExample(): Project {
  const b = builder();
  const t = add(b, 'gencol', 't', 0, 0, { ...GENCOL_DEFAULTS, name: 'Time (h)', mode: 'formula', formula: 'if(i <= 60, (i - 1)/6, 40 + (i - 61)/6)', count: 120 });
  const sig = add(b, 'mathcol', 'sig', 420, 0, { ...MATHCOL_DEFAULTS, formula: '100*(1 - exp(-A/4)) + 5*sin(A)', name: 'Signal (mV)' });
  link(b, t, sig, 'in-0');
  const temp = add(b, 'mathcol', 'temp', 420, 300, { ...MATHCOL_DEFAULTS, formula: '25 + 10*exp(-((A - 5)/3)^2) + 0.05*A', name: 'Temperature (°C)' });
  link(b, t, temp, 'in-0');
  const pres = add(b, 'mathcol', 'pres', 420, 600, { ...MATHCOL_DEFAULTS, formula: '1.0 + 0.02*A + 0.05*cos(A/2)', name: 'Pressure (bar)' });
  link(b, t, pres, 'in-0');
  const coloured = (c: string) => side({ color: c, labelText: { color: c }, titleText: { color: c } });
  const p = add(
    b,
    'plot1d',
    'plot-3',
    900,
    0,
    plot(
      {
        label: 'signal',
        style: curve(0, { lineWidth: 1 }),
        rows: [
          { label: 'temperature', style: curve(2, { lineWidth: 1, axisY: 'right' }) },
          { label: 'pressure', style: curve(1, { lineWidth: 1, dash: 'dash', axisY: 'y3' }) },
        ],
      },
      {
        axes: {
          x: { ...AXES_STYLE_DEFAULTS.x, breaks: '11-39', ticksBy: 'increment', step: 2, minor: 1 },
          right: { mode: 'own', scale: AXES_STYLE_DEFAULTS.y, fn: '' },
          sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Time (h)' }), left: side({ title: 'Signal (mV)' }), right: { ...coloured(PALETTE[2]), labels: true, showTitle: true }, top: side({ labels: false, showTitle: false }) },
          extra: [{ id: 'y3', side: 'right', scale: AXES_STYLE_DEFAULTS.y, style: { ...coloured(PALETTE[1]), offset: 34, labels: true, showTitle: true } }],
        },
        legend: { x: 96, y: 60, anchor: 'cr', frame: 'line', background: '#ffffff' },
        page: { width: 110, height: 70, name: 'three_axes' },
      },
    ),
  );
  link(b, t, p, 'x');
  link(b, sig, p, 'y');
  link(b, temp, p, 'y-1');
  link(b, pres, p, 'y-2');
  return project(b, 'Three Y axes and a broken X axis');
}

// A workbook of four runs (a spreadsheet file with a sheet per run): time, temperature, signal and its error in each.
function runsWorkbook(): ImportSheet[] {
  const r = rng(11);
  return [1, 2, 3, 4].map((k) => {
    const lines = ['Time\tTemperature\tSignal\tσ', 's\t°C\tmV\tmV'];
    for (let t = 0; t <= 60; t += 2) {
      const y = (1 - Math.exp(-t / (6 + 4 * k))) * (1 + 0.15 * k);
      lines.push([t, (21 + 0.4 * k + 0.05 * gauss(r)).toFixed(2), (y + 0.02 * gauss(r)).toFixed(4), (0.02 + 0.01 * r()).toFixed(4)].join('\t'));
    }
    return { name: `Run ${k}`, text: lines.join('\n'), excel: true };
  });
}

// Photoluminescence of one sample at six temperatures, a file each (the names say the temperature): the peak moves to
// longer wavelengths as it warms (the band gap shrinks) and broadens.
function plSeries(): ImportSheet[] {
  const r = rng(23);
  return [300, 100, 250, 150, 200, 50].map((T) => {
    const eV = 1.52 - (5.4e-4 * T * T) / (T + 204);
    const c = 1239.84 / eV;
    const w = 9 + 0.03 * T;
    const lines = ['Wavelength (nm)\tIntensity (a.u.)'];
    for (let l = 760; l <= 900; l += 0.5) lines.push(`${l}\t${((1 - T / 600) * Math.exp(-(((l - c) / w) ** 2)) + 0.03 * gauss(r)).toFixed(4)}`);
    return { name: `PL_${T}K`, text: lines.join('\n'), excel: true };
  });
}

// Batch: the same steps on every file (Smooth, then the maximum by Pick points); the temperature read from the file
// names; the peak against the temperature in a Plot.
function batchExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'pl-files', 0, 0, { ...IMPORT_DEFAULTS, name: 'PL spectra', fileName: '6 files', textId: 'pl-series', sheets: plSeries(), sheet: 0 });
  const inner: AppNode[] = [
    { id: 'group-in', type: 'groupin', position: { x: -380, y: 0 }, data: {} },
    { id: 'sm', type: 'smooth', position: { x: 0, y: 0 }, data: { ...SMOOTH_DEFAULTS, points: 15 } },
    { id: 'pk', type: 'pick', position: { x: 620, y: 0 }, data: { ...PICK_DEFAULTS, rules: [{ kind: 'max', value: '' }] } },
    { id: 'group-out', type: 'groupout', position: { x: 1240, y: 0 }, data: {} },
  ] as AppNode[];
  const innerEdges = [
    { id: 'b-in', source: 'group-in', sourceHandle: 'in-0', target: 'sm', targetHandle: 'in' },
    { id: 'b-sm', source: 'sm', sourceHandle: 'out', target: 'pk', targetHandle: 'in' },
    { id: 'b-out', source: 'pk', sourceHandle: 'out', target: 'group-out', targetHandle: 'out-0' },
  ];
  const bt = add(b, 'subgraph', 'pl-batch', 640, 0, { name: 'The peak of every spectrum', nodes: inner, edges: innerEdges, inputs: [{ id: 'in-0', label: 'files', type: 'dataset' }], outputs: [{ id: 'out-0', label: 'peak', type: 'dataset' }], batch: { pattern: 'PL_{T}K', order: 'value' } });
  link(b, imp, bt, 'in-0', 'book');
  const pl = add(b, 'plot1d', 'pl-shift', 1120, 0, plot({ label: 'peak', style: curve(0, { mode: 'linesymbol', symbolSize: 5 }), cols: { x: 'T', y: 'Wavelength (nm)' } }, { axes: { sides: { ...axes().sides, bottom: side({ title: 'Temperature (K)' }), left: side({ title: 'Peak wavelength (nm)' }) } }, page: { name: 'pl_peak_vs_T' } }));
  link(b, bt, pl, 'dataset', 'table');
  return project(b, 'Batch: the peak of every spectrum in a folder');
}

function workbookExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'runs', 0, 0, { ...IMPORT_DEFAULTS, name: 'Runs', fileName: 'runs.xlsx', textId: 'runs-1', sheets: runsWorkbook(), sheet: 0, csv: { ...IMPORT_DEFAULTS.csv, nameLine: 1, unitLine: 2 } });
  // every sheet: Time is X, Signal Y, σ its error; each Y named by its sheet (the legend shows the runs)
  const ax = add(b, 'autoextract', 'auto', 640, 0, {
    rules: [
      { sheets: '*', columns: 'Time', role: 'x' },
      { sheets: '*', columns: 'Signal', role: 'y' },
      { sheets: '*', columns: 'D', role: 'yerr' },
    ],
    names: 'sheet',
  });
  link(b, imp, ax, 'in', 'book');
  const rows = [1, 2, 3, 4].map((k) => ({ label: '', style: curve(k - 1, { mode: 'linesymbol', symbolSize: 3.5, errCap: 2 }), cols: { x: `Run ${k}: Time (s)`, y: `Run ${k}`, yerr: `Run ${k}: σ (mV)` } }));
  const [head, ...rest] = rows;
  const pl = add(b, 'plot1d', 'runs-plot', 1180, 0, plot({ label: '', style: head.style, cols: head.cols, rows: rest }, { legend: { x: 96, y: 96, anchor: 'br' }, page: { name: 'runs' } }));
  link(b, ax, pl, 'dataset');
  // one column of one sheet: Extract column chooses the sheet
  const ex = add(b, 'extract', 'run3-temp', 640, 620, { ...EXTRACT_DEFAULTS, sheet: 'Run 3', column: 'Temperature (°C)', index: 1 });
  link(b, imp, ex, 'in', 'book');
  const st = add(b, 'stats', 'run3-stats', 1180, 900, {});
  link(b, ex, st, 'in');
  return project(b, 'Four runs in a workbook: Auto-extract');
}

// A photocurrent map saved a row per voltage (a column per wavelength): Rows to columns gives a spectrum per voltage
// (each column keeps its voltage), Stack columns the long table, and Convert columns reads a table of text with units
function sweepExample(): Project {
  const b = builder();
  const V = [-0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
  const wl = Array.from({ length: 14 }, (_, k) => 400 + 10 * k);
  const r = rng(11);
  const lines = [['Voltage (V)', ...wl.map((w) => `${w} nm`)].join(',')];
  for (const v of V) lines.push([String(v), ...wl.map((w) => ((v + 0.6) * Math.exp(-(((w - 460) / 40) ** 2)) * 1e-4 * (1 + 0.01 * gauss(r))).toExponential(4))].join(','));
  const imp = add(b, 'import', 'sw-map', 0, 0, { ...IMPORT_DEFAULTS, name: 'photocurrent map', fileName: 'photocurrent_map.csv', text: lines.join('\n'), textId: 'sw-1' });
  const tr = add(b, 'transpose', 'sw-turn', 700, 0, { ...TRANSPOSE_DEFAULTS, head: 'number', headName: 'Wavelength (nm)', fmt: { template: '{v} V' } });
  link(b, imp, tr, 'in');
  const [head, ...rest] = V.map((v, k) => ({ label: `${v} V`, style: curve(k, { mode: 'linesymbol', symbolSize: 3 }), cols: { x: 'Wavelength (nm)', y: `${v} V` } }));
  const pl = add(b, 'plot1d', 'sw-plot', 1400, 0, plot({ label: head.label, style: head.style, cols: head.cols, rows: rest }, { legend: { x: 96, y: 96, anchor: 'tr' }, page: { name: 'photocurrent' } }));
  link(b, tr, pl, 'dataset');
  const st = add(b, 'stack', 'sw-long', 700, 760, { ...STACK_DEFAULTS, key: 'number', keyName: 'Voltage (V)', valueName: 'Photocurrent (A)' });
  link(b, tr, st, 'in');
  const notes = ['Sample,Temperature,Band gap,Yield', 'A,300 K,1.21 ± 0.02 eV,45 %', 'B,310 K,1.18 ± 0.03 eV,52 %', 'C,320 K,1.15 ± 0.02 eV,n.d.', 'D,330 K,1.13 ± 0.04 eV,61 %'];
  const tx = add(b, 'import', 'sw-text', 0, 1500, { ...IMPORT_DEFAULTS, name: 'samples', fileName: 'samples.csv', text: notes.join('\n'), textId: 'sw-2' });
  const cv = add(b, 'convert', 'sw-convert', 700, 1500, { ...CONVERT_DEFAULTS, cols: 'B-D' });
  link(b, tx, cv, 'in');
  return project(b, 'Rows to columns: a voltage sweep turned into spectra');
}

// n and k of gold in one file, the k block written under the n block: Split into columns lays
// them side by side (wl, n, k), one Plot draws n on the left axis and k on its own right axis.
function nkExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'nk-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'Au (Johnson & Christy)', fileName: 'Johnson.csv', text: JOHNSON_AU, textId: 'johnson-1' });
  const un = add(b, 'unstack', 'nk-split', 640, 0, { ...UNSTACK_DEFAULTS });
  link(b, imp, un, 'in');
  const coloured = (c: string) => side({ color: c, labelText: { color: c }, titleText: { color: c } });
  const p = add(
    b,
    'plot1d',
    'nk-plot',
    1140,
    0,
    plot(
      {
        label: 'n',
        style: curve(1, { mode: 'linesymbol', symbol: 'circle', symbolSize: 3.5, lineWidth: 1 }),
        cols: { x: 'wl', y: 'n' },
        rows: [{ label: 'k', style: curve(2, { mode: 'linesymbol', symbol: 'square', symbolSize: 3.5, lineWidth: 1, axisY: 'right' }), cols: { x: 'wl', y: 'k' } }],
      },
      {
        axes: {
          right: { mode: 'own', scale: AXES_STYLE_DEFAULTS.y, fn: '' },
          sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Wavelength (µm)' }), left: { ...coloured(PALETTE[1]), title: 'n' }, right: { ...coloured(PALETTE[2]), title: 'k', labels: true, showTitle: true }, top: side({ labels: false, showTitle: false }) },
        },
        legend: { x: 50, y: 6, anchor: 'tc', arrange: 'row' },
        page: { width: 85, height: 65, name: 'gold_nk' },
      },
    ),
  );
  link(b, un, p, 'dataset');
  add(b, 'note', 'nk-note', -560, 0, {
    text: 'The file holds two blocks: wl, n, then an empty line and wl, k written again under it. Split into columns (Blocks: auto) finds the line where wl is not a number, names the second block by its header (k) and keeps one wl (X out ▸ every block would keep both). Its “block values” output gives 1, 2 here; on a sweep it gives the swept value of every block.',
  });
  return project(b, 'Gold n, k: two blocks in one file');
}

// Strong coupling, computed by transfer matrices: R(λ) of a DBR microcavity with an excitonic layer for 23 cavity thicknesses
// (one table: the sweep). Fit: two Lorentzian dips per run (the polariton branches, one each side of the exciton) →
// their positions vs the thickness → a second Fit of both branches together (anticrossing) gives the splitting Ω.
function strongCouplingTable(): string {
  const R = SC_R.split(' ');
  const lines = ['cavity d (nm),Wavelength (nm),R'];
  let k = 0;
  for (let d = SC_D.from; d <= SC_D.to; d += SC_D.step) for (let l = SC_LAMBDA.from; l <= SC_LAMBDA.to; l += SC_LAMBDA.step) lines.push(`${d},${l},${R[k++]}`);
  return lines.join('\n');
}

function strongCouplingExample(): Project {
  const b = builder();
  const lim = (name: string, min: number, max: number): FitParamSpec => ({ name, value: NaN, fixed: false, min, max, shared: false });
  const imp = add(b, 'import', 'sc-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'strong coupling', fileName: 'strong_coupling_spr_forge.csv', text: strongCouplingTable(), textId: 'sc-1', edits: { cols: { 0: { role: 'none' }, 1: { role: 'x' }, 2: { role: 'y' } } } });
  // the sweep in one table cut into columns: λ and R for every thickness (each column knows its thickness)
  const split = add(b, 'unstack', 'sc-split', 640, 0, { ...UNSTACK_DEFAULTS, x: 'Wavelength (nm)', ys: 'R', by: 'column', column: 'cavity d (nm)' });
  link(b, imp, split, 'in');
  // every column: a linear baseline and two dips, the lower branch below the exciton (652.5 nm), the upper one above it
  const fit = add(b, 'fit', 'sc-fit', 1240, 0, {
    ...FIT_DEFAULTS,
    model: { ...FIT_DEFAULTS.model, kind: 'peaks', shape: 'lorentz', count: 2, baseline: 'linear' },
    params: [lim('A1', NaN, 0), lim('A2', NaN, 0), lim('xc1', 595, 652.5), lim('xc2', 652.5, 725), lim('w1', 0.5, 30), lim('w2', 0.5, 30)],
    ranges: [{ lo: 595, hi: 728 }],
    band: 'none',
  });
  link(b, split, fit, 'in');
  // the branches vs the thickness: both fitted at once with the coupled-oscillator dispersion
  const disp = add(b, 'fit', 'sc-disp', 1900, 0, { ...FIT_DEFAULTS, x: 'cavity d (nm)', ys: ['xc1', 'xc2'], model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'anticross' } });
  link(b, fit, disp, 'in', 'params');
  // (a) every second spectrum with its fit, coloured by the thickness; (b) the branches and the anticrossing
  const ds: number[] = [];
  for (let d = SC_D.from; d <= SC_D.to; d += SC_D.step) ds.push(d);
  const shown = ds.filter((_, k) => k % 2 === 0);
  const runName = (d: number) => `R · cavity d = ${d} nm`;
  const spectraRows = shown.flatMap((d) => [
    { label: '', style: curve(0, { lineWidth: 0.8 }), cols: { x: 'Wavelength (nm)', y: runName(d) } },
    { label: '', style: curve(0, { lineWidth: 0.5, dash: 'dash' as const }), cols: { x: `Wavelength (nm) (${runName(d)})`, y: `fit (${runName(d)})` } },
  ]);
  const [first, ...rest] = spectraRows;
  const spectra = add(
    b,
    'plot1d',
    'sc-spectra',
    1240,
    1150,
    {
      ...plot(
        { ...first, rows: rest },
        {
          axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'λ (nm)' }), left: side({ title: 'R' }) }, x: { ...AXES_STYLE_DEFAULTS.x, min: 595, max: 728 } },
          notes: [note('sc-cbar', 'colorbar', { ...COLORBAR_DEFAULTS, x: 103, y: 0, length: 100, thickness: 5, title: '' })],
          page: { width: 90, height: 75, name: 'sc_spectra' },
        },
      ),
      curveColors: { map: 'viridis' },
    },
  );
  link(b, split, spectra, 'dataset');
  link(b, fit, spectra, 'dataset', 'fit');
  const branches = add(
    b,
    'plot1d',
    'sc-branches',
    1900,
    1150,
    plot(
      {
        label: 'lower branch',
        style: curve(1, { mode: 'scatter', symbol: 'circle', symbolSize: 3.5 }),
        cols: { x: 'cavity d (nm)', y: 'xc1', yerr: 'xc1 error' },
        rows: [
          { label: 'upper branch', style: curve(2, { mode: 'scatter', symbol: 'square', symbolSize: 3.5 }), cols: { x: 'cavity d (nm)', y: 'xc2', yerr: 'xc2 error' } },
          { label: 'coupled oscillators', style: curve(0, { lineWidth: 1 }), cols: { x: 'cavity d (nm) (xc1)', y: 'fit (xc1)' } },
          { label: '', style: curve(0, { lineWidth: 1 }), cols: { x: 'cavity d (nm) (xc2)', y: 'fit (xc2)' } },
        ],
      },
      {
        axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'cavity thickness (nm)' }), left: side({ title: 'dip position (nm)' }) } },
        // the two branches of the fit: one entry
        legend: {
          ...LEGEND_STYLE_DEFAULTS,
          x: 4,
          y: 4,
          anchor: 'tl',
          entries: [
            { key: 'sc-branches:0', show: true, label: '' },
            { key: 'sc-branches:1', show: true, label: '' },
            { key: 'sc-branches:2', show: true, label: '' },
            { key: 'sc-branches:3', show: false, label: '' },
          ],
        },
        page: { width: 90, height: 75, name: 'sc_branches' },
      },
    ),
  );
  link(b, fit, branches, 'dataset', 'params');
  link(b, disp, branches, 'dataset', 'fit');
  const cv = add(b, 'canvas', 'sc-canvas', 2600, 0, { ...CANVAS_DEFAULTS, width: 180, height: 75, panels: '(a)', name: 'strong_coupling', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 2 } });
  link(b, spectra, cv, 'figures', 'figure');
  link(b, branches, cv, 'figures', 'figure');
  add(b, 'note', 'sc-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'Data: computed by transfer matrices — R(λ) of a TiO₂/SiO₂ microcavity with an excitonic layer (652.5 nm), for cavity thicknesses 150–260 nm, all in one table.\n\nSplit into columns (by “cavity d”): λ and one R column per thickness — each column knows its thickness.\n\nFit 1 (every R column): two Lorentzian dips over a linear baseline, the first below the exciton, the second above it (limits of xc1, xc2); its parameters table has a row per thickness.\n\nFit 2 (that table): xc1 and xc2 vs the thickness, both branches at once with the coupled-oscillator dispersion → Ω, the splitting at zero detuning.\n\nThe Plots take the data and the fit curves (datasets) and draw them like any data; the spectra are coloured by the thickness. The Merge puts the two Plots side by side.',
  });
  return project(b, 'Strong coupling: fit of every run, then the anticrossing');
}

// ---- Charts: bars and a histogram with its fits ----
const roles = (r: Record<number, 'x' | 'y' | 'yerr' | 'label'>) => ({ cols: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { role: v }])) });
const titled = (bottom: string, left: string, patch: Partial<AxesStyle> = {}) => axes({ ...patch, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: bottom }), left: side({ title: left }) } });

// grouped bars with labels: the mean measures of the Palmer penguins
function groupedBarsExample(): Project {
  const b = builder();
  const text = 'Species;Bill depth (mm);Bill length (mm);Flipper length (mm)\nAdelie;18.35;38.79;189.95\nChinstrap;18.43;48.83;195.82\nGentoo;14.98;47.50;217.19';
  const imp = add(b, 'import', 'gb-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'penguins', fileName: 'penguin_means.txt', text, textId: 'gb-1', edits: roles({ 0: 'x', 1: 'y', 2: 'y', 3: 'y' }) });
  const bc = add(b, 'barchart', 'gb-chart', 640, 0, {
    ...BARCHART_DEFAULTS,
    arrange: 'grouped',
    gap: 0.05,
    labels: 'top',
    decimals: 1,
    edgeWidth: 0,
    axes: titled('', 'Length (mm)', { y: { ...AXES_STYLE_DEFAULTS.y, min: 0, max: 300 } }),
    legend: { show: true, x: 3, y: 3, anchor: 'tl' },
    page: { ...PLOT_PAGE_DEFAULTS, name: 'penguins_grouped' },
  });
  link(b, imp, bc, 'dataset');
  return project(b, 'Grouped bars with their values');
}

// stacked and 100 % stacked columns, side by side in a Merge
function stackedBarsExample(): Project {
  const b = builder();
  const text = 'Species;Below 3.5 kg;Above 3.5 kg\nAdelie;70;82\nChinstrap;31;37\nGentoo;58;66';
  const imp = add(b, 'import', 'sb-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'body mass', fileName: 'penguin_mass.txt', text, textId: 'sb-1', edits: roles({ 0: 'x', 1: 'y', 2: 'y' }) });
  const common = { ...BARCHART_DEFAULTS, labels: 'center' as const, edgeWidth: 0.5, width: 0.6, legend: { show: true, x: 96, y: 4, anchor: 'tr' as const } };
  const s1 = add(b, 'barchart', 'sb-count', 640, 0, { ...common, arrange: 'stacked', axes: titled('', 'Penguins', { y: { ...AXES_STYLE_DEFAULTS.y, min: 0, max: 180 } }), page: { ...PLOT_PAGE_DEFAULTS, name: 'stacked' } });
  const s2 = add(b, 'barchart', 'sb-pct', 640, 1500, { ...common, arrange: 'percent', decimals: 0, barLook: { hatch: '/', hatchColor: '#ffffff', hatchSpacing: 5, hatchWidth: 0.8 }, axes: titled('', 'Share (%)', { y: { ...AXES_STYLE_DEFAULTS.y, min: 0, max: 100 } }), page: { ...PLOT_PAGE_DEFAULTS, name: '100_percent' } });
  link(b, imp, s1, 'dataset');
  link(b, imp, s2, 'dataset');
  const cv = add(b, 'canvas', 'sb-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 70, panels: '(a)', name: 'stacked_bars', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 3, legend: 'bottom' } });
  link(b, s1, cv, 'figures', 'figure');
  link(b, s2, cv, 'figures', 'figure');
  return project(b, 'Stacked and 100 % stacked bars');
}

// horizontal bars with errors: a score each, its error, the values written
function horizontalBarsExample(): Project {
  const b = builder();
  const text = 'Person;Performance;Error\nTom;11.2;1.1\nDick;7.3;0.6\nHarry;13.1;1.4\nSlim;4.6;0.5\nJim;9.8;0.9';
  const imp = add(b, 'import', 'hb-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'performance', fileName: 'performance.txt', text, textId: 'hb-1', edits: roles({ 0: 'x', 1: 'y', 2: 'yerr' }) });
  const bc = add(b, 'barchart', 'hb-chart', 640, 0, {
    ...BARCHART_DEFAULTS,
    horizontal: true,
    width: 0.6,
    edgeWidth: 0,
    labels: 'top',
    decimals: 1,
    errCap: 3,
    barLook: { gradient: true, radius: 2 },
    colors: ['#0072B2'],
    axes: titled('Performance', '', { x: { ...AXES_STYLE_DEFAULTS.x, min: 0, max: 17 }, y: { ...AXES_STYLE_DEFAULTS.y, reverse: true } }),
    legend: { show: false },
    page: { ...PLOT_PAGE_DEFAULTS, name: 'performance' },
  });
  link(b, imp, bc, 'dataset');
  return project(b, 'Horizontal bars with errors');
}

// grouped columns from indexed data with error bars: raw replicates, mean ± SD per treatment and day, the values over
// the bars
function rawBarsExample(): Project {
  const b = builder();
  const r = rng(21);
  const lines = ['Treatment;Day;Viability (%)'];
  for (const [g, mu] of [['control', 92], ['drug A', 74], ['drug B', 58]] as const)
    for (const [day, dm] of [['day 1', 0], ['day 7', -12]] as const) for (let k = 0; k < 6; k++) lines.push(`${g};${day};${(mu + dm + 4 * gauss(r)).toFixed(1)}`);
  const imp = add(b, 'import', 'rb-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'viability', fileName: 'viability.txt', text: lines.join('\n'), textId: 'rb-1' });
  const bc = add(b, 'barchart', 'rb-chart', 640, 0, {
    ...BARCHART_DEFAULTS,
    mode: 'raw',
    value: 'Viability (%)',
    group: 'Treatment',
    sub: 'Day',
    stat: 'mean',
    err: 'sd',
    points: true,
    gap: 0.08,
    opacity: 0.85,
    colors: ['#56B4E9', '#E69F00'],
    errCap: 4,
    axes: titled('', 'Viability (%)', { y: { ...AXES_STYLE_DEFAULTS.y, min: 0, max: 110 } }),
    legend: { show: true, x: 96, y: 4, anchor: 'tr' },
    page: { ...PLOT_PAGE_DEFAULTS, name: 'viability' },
  });
  link(b, imp, bc, 'dataset');
  return project(b, 'Bars from raw values: mean ± SD with the points');
}

// floating columns: a monthly range from the first column to the second (example values)
function floatingBarsExample(): Project {
  const b = builder();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const lo = [-5.5, -4, 0, 5, 10, 14, 16, 15, 11, 5, 1, -3];
  const hi = [1.5, 4.5, 11, 18, 24, 28, 30, 30, 25, 18, 10, 4];
  const text = ['Month;Minimum (°C);Maximum (°C)', ...months.map((m, i) => `${m};${lo[i]};${hi[i]}`)].join('\n');
  const imp = add(b, 'import', 'fb-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'temperatures', fileName: 'monthly_range.txt', text, textId: 'fb-1', edits: roles({ 0: 'x', 1: 'y', 2: 'y' }) });
  const bc = add(b, 'barchart', 'fb-chart', 640, 0, {
    ...BARCHART_DEFAULTS,
    arrange: 'floating',
    width: 0.6,
    colors: ['#D55E00'],
    opacity: 0.8,
    barLook: { radius: 2, shadow: true },
    axes: titled('', 'Temperature (°C)', { y: { ...AXES_STYLE_DEFAULTS.y, min: -10, max: 35 } }),
    legend: { show: false },
    page: { ...PLOT_PAGE_DEFAULTS, name: 'temperature_range' },
  });
  link(b, imp, bc, 'dataset');
  return project(b, 'Floating columns: a range per month');
}

// a histogram of a two-mode sample with its fits: two normals from the data (maximum likelihood), two Gaussians fitted
// to the bars, a kernel density
function histogramExample(): Project {
  const b = builder();
  const r = rng(5);
  const v = [...Array.from({ length: 200 }, () => 18 + 2.4 * gauss(r)), ...Array.from({ length: 150 }, () => 31 + 3.5 * gauss(r))];
  const imp = add(b, 'import', 'hi-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'particles', fileName: 'particle_sizes.txt', text: ['Diameter (nm)', ...v.map((x) => x.toFixed(2))].join('\n'), textId: 'hi-1', edits: roles({ 0: 'y' }) });
  const h = add(b, 'histogram', 'hi-chart', 640, 0, {
    ...HISTOGRAM_DEFAULTS,
    bins: { ...HISTOGRAM_DEFAULTS.bins, mode: 'width', width: 1.5 },
    opacity: 0.5,
    colors: ['#56B4E9'],
    barLook: { hatch: '/', hatchColor: '#0072B2', hatchSpacing: 5, hatchWidth: 0.5 },
    fits: [
      { kind: 'binormal', method: 'data', color: '#D55E00', width: 1.8 },
      { kind: 'binormal', method: 'bars', color: '#009E73', dash: 'dash' },
      { kind: 'kernel', method: 'data', color: '#555555', dash: 'dot' },
    ],
    page: { ...PLOT_PAGE_DEFAULTS, name: 'particle_sizes' },
  });
  link(b, imp, h, 'dataset');
  return project(b, 'Histogram with two-mode fits');
}

// ---- Charts: boxes and violins ----
// four groups of values, one with outliers: a column each
function boxColumns(seed: number): string {
  const r = rng(seed);
  const groups = [Array.from({ length: 40 }, () => 52 + 6 * gauss(r)), Array.from({ length: 40 }, () => 60 + 4 * gauss(r)), [...Array.from({ length: 37 }, () => 48 + 5 * gauss(r)), 75, 78, 22], Array.from({ length: 40 }, () => 40 + 9 * Math.abs(gauss(r)))];
  return ['Sample A;Sample B;Sample C;Sample D', ...Array.from({ length: 40 }, (_, i) => groups.map((g) => g[i].toFixed(2)).join(';'))].join('\n');
}

// notched boxes with the mean and the outliers; the same horizontal, whiskers 5 – 95
function boxPlotsExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'bx-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'samples', fileName: 'samples.txt', text: boxColumns(31), textId: 'bx-1', edits: roles({ 0: 'y', 1: 'y', 2: 'y', 3: 'y' }) });
  const v = add(b, 'boxviolin', 'bx-notch', 640, 0, { ...BOXVIOLIN_DEFAULTS, notch: true, mean: true, colorBy: 'category', axes: titled('', 'Value'), legend: { show: false }, page: { ...PLOT_PAGE_DEFAULTS, name: 'notched' } });
  const h = add(b, 'boxviolin', 'bx-horiz', 640, 1500, { ...BOXVIOLIN_DEFAULTS, horizontal: true, whisker: 'p5', colorBy: 'category', opacity: 0.6, barLook: { hatch: '/', hatchSpacing: 4 }, axes: titled('Value', ''), legend: { show: false }, page: { ...PLOT_PAGE_DEFAULTS, name: 'horizontal' } });
  link(b, imp, v, 'dataset');
  link(b, imp, h, 'dataset');
  const cv = add(b, 'canvas', 'bx-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 70, panels: '(a)', name: 'box_plots', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 3 } });
  link(b, v, cv, 'figures', 'figure');
  link(b, h, cv, 'figures', 'figure');
  return project(b, 'Box plots: notched, horizontal');
}

// box plot vs violin plot: the same groups as boxes and as violins (quartile lines)
function boxVsViolinExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'bv-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'samples', fileName: 'samples.txt', text: boxColumns(47), textId: 'bv-1', edits: roles({ 0: 'y', 1: 'y', 2: 'y', 3: 'y' }) });
  const bx = add(b, 'boxviolin', 'bv-box', 640, 0, { ...BOXVIOLIN_DEFAULTS, colorBy: 'category', axes: titled('', 'Value'), legend: { show: false }, page: { ...PLOT_PAGE_DEFAULTS, name: 'box' } });
  const vi = add(b, 'boxviolin', 'bv-violin', 640, 1500, { ...BOXVIOLIN_DEFAULTS, kind: 'violin', inner: 'quartiles', colorBy: 'category', width: 0.8, axes: titled('', 'Value'), legend: { show: false }, page: { ...PLOT_PAGE_DEFAULTS, name: 'violin' } });
  link(b, imp, bx, 'dataset');
  link(b, imp, vi, 'dataset');
  const cv = add(b, 'canvas', 'bv-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 70, panels: '(a)', name: 'box_vs_violin', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 3, shareY: 'all' } });
  link(b, bx, cv, 'figures', 'figure');
  link(b, vi, cv, 'figures', 'figure');
  return project(b, 'Box plot vs violin plot');
}

// raw values by treatment and day (indexed data)
function indexedValues(seed: number): string {
  const r = rng(seed);
  const lines = ['Treatment;Day;Response'];
  for (const [g, mu] of [['control', 20], ['low dose', 26], ['high dose', 34]] as const)
    for (const [day, dm, sd] of [['day 1', 0, 3], ['day 7', 6, 4.5]] as const) for (let k = 0; k < 30; k++) lines.push(`${g};${day};${(mu + dm + sd * gauss(r)).toFixed(2)}`);
  return lines.join('\n');
}

// grouped boxes from indexed data: the boxes of every treatment by day, the values beside as a swarm
function groupedBoxExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'gx-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'response', fileName: 'response.txt', text: indexedValues(53), textId: 'gx-1' });
  const bx = add(b, 'boxviolin', 'gx-chart', 640, 0, {
    ...BOXVIOLIN_DEFAULTS,
    mode: 'raw',
    value: 'Response',
    group: 'Treatment',
    sub: 'Day',
    points: 'swarm',
    width: 0.8,
    gap: 0.15,
    mean: true,
    opacity: 0.55,
    colors: ['#56B4E9', '#E69F00'],
    axes: titled('', 'Response'),
    legend: { show: true, x: 4, y: 4, anchor: 'tl' },
    page: { ...PLOT_PAGE_DEFAULTS, name: 'grouped_boxes' },
  });
  link(b, imp, bx, 'dataset');
  return project(b, 'Grouped boxes from indexed data, with the values');
}

// half violins with boxes, and rainclouds: the same values twice
function rainExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'rc-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'response', fileName: 'response.txt', text: indexedValues(59), textId: 'rc-1' });
  const common = { ...BOXVIOLIN_DEFAULTS, mode: 'raw' as const, value: 'Response', group: 'Treatment', colorBy: 'category' as const, width: 0.85, legend: { show: false }, outliers: false };
  const half = add(b, 'boxviolin', 'rc-half', 640, 0, { ...common, kind: 'half', barLook: { gradient: true }, axes: titled('', 'Response'), page: { ...PLOT_PAGE_DEFAULTS, name: 'half_violin' } });
  const rain = add(b, 'boxviolin', 'rc-rain', 640, 1500, { ...common, kind: 'raincloud', points: 'jitter', horizontal: true, opacity: 0.7, axes: titled('Response', ''), page: { ...PLOT_PAGE_DEFAULTS, name: 'raincloud' } });
  link(b, imp, half, 'dataset');
  link(b, imp, rain, 'dataset');
  const cv = add(b, 'canvas', 'rc-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 75, panels: '(a)', name: 'half_and_raincloud', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 3 } });
  link(b, half, cv, 'figures', 'figure');
  link(b, rain, cv, 'figures', 'figure');
  return project(b, 'Half violins and raincloud');
}

// a split violin: the two days of every treatment, a half each, their quartiles
function splitViolinExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'sv-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'response', fileName: 'response.txt', text: indexedValues(61), textId: 'sv-1' });
  const vi = add(b, 'boxviolin', 'sv-chart', 640, 0, {
    ...BOXVIOLIN_DEFAULTS,
    mode: 'raw',
    value: 'Response',
    group: 'Treatment',
    sub: 'Day',
    kind: 'violin',
    split: true,
    width: 0.85,
    cut: 'extend',
    colors: ['#009E73', '#CC79A7'],
    opacity: 0.7,
    axes: titled('', 'Response'),
    legend: { show: true, x: 4, y: 4, anchor: 'tl' },
    page: { ...PLOT_PAGE_DEFAULTS, name: 'split_violins' },
  });
  link(b, imp, vi, 'dataset');
  return project(b, 'Split violins: two subgroups');
}

// ---- Charts: probability plots (Q-Q, normal probability, ECDF, Weibull) ----
// tensile strengths of one batch (a normal sample)
function strengthFile(seed: number): string {
  const r = rng(seed);
  return ['Strength (MPa)', ...Array.from({ length: 50 }, () => (412 + 18 * gauss(r)).toFixed(1))].join('\n');
}
// Q-Q and normal probability plots: the quantiles with the quartile line and its 95 % band; the
// values on a normal probability axis with the fitted line and its band; in a Merge
function qqProbabilityExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'pq-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'strength', fileName: 'strength.txt', text: strengthFile(71), textId: 'pq-1', edits: roles({ 0: 'y' }) });
  const qq = add(b, 'probplot', 'pq-qq', 640, 0, { ...PROBPLOT_DEFAULTS, band: 'pointwise', page: { ...PLOT_PAGE_DEFAULTS, name: 'qq_plot' } });
  const pr = add(b, 'probplot', 'pq-prob', 640, 1500, { ...PROBPLOT_DEFAULTS, kind: 'prob', line: 'dist', band: 'pointwise', symbol: 'square', symbolSize: 4, page: { ...PLOT_PAGE_DEFAULTS, name: 'probability_plot' } });
  link(b, imp, qq, 'dataset');
  link(b, imp, pr, 'dataset');
  const cv = add(b, 'canvas', 'pq-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 75, panels: '(a)', name: 'qq_and_probability', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 3 } });
  link(b, qq, cv, 'figures', 'figure');
  link(b, pr, cv, 'figures', 'figure');
  return project(b, 'Q-Q and normal probability plots');
}

// the reaction times of two groups (indexed: value + group), the second skewed (lognormal)
function reactionFile(seed: number): string {
  const r = rng(seed);
  const lines = ['Group;Reaction time (ms)'];
  for (let k = 0; k < 40; k++) lines.push(`rested;${(250 + 30 * gauss(r)).toFixed(0)}`);
  for (let k = 0; k < 40; k++) lines.push(`sleep deprived;${(300 * Math.exp(0.22 * gauss(r))).toFixed(0)}`);
  return lines.join('\n');
}
// empirical cumulative distribution functions: the ECDF of two groups with their simultaneous (DKW)
// bands, and 1 − F (the complementary ECDF) with the fitted lognormal CDFs
function ecdfExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'ec-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'reaction', fileName: 'reaction.txt', text: reactionFile(73), textId: 'ec-1' });
  const common = { ...PROBPLOT_DEFAULTS, kind: 'ecdf' as const, mode: 'raw' as const, value: 'Reaction time (ms)', group: 'Group', colors: ['#0072B2', '#D55E00'], lineWidth: 1.2 };
  const e = add(b, 'probplot', 'ec-ecdf', 640, 0, { ...common, line: 'none', band: 'dkw', bandDash: 'dot', legend: { show: true, x: 96, y: 96, anchor: 'br' }, page: { ...PLOT_PAGE_DEFAULTS, name: 'ecdf' } });
  const c = add(b, 'probplot', 'ec-ccdf', 640, 1500, { ...common, dist: 'lognormal', line: 'dist', complementary: true, lineDash: 'dash', legend: { show: true, x: 96, y: 4, anchor: 'tr' }, page: { ...PLOT_PAGE_DEFAULTS, name: 'complementary_ecdf' } });
  link(b, imp, e, 'dataset');
  link(b, imp, c, 'dataset');
  const cv = add(b, 'canvas', 'ec-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 75, panels: '(a)', name: 'ecdf', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 3 } });
  link(b, e, cv, 'figures', 'figure');
  link(b, c, cv, 'figures', 'figure');
  return project(b, 'ECDF of two groups, bands and 1 − F');
}

// the hours to failure of two batches of a component (Weibull samples, k = 1.8 and 3.2)
function failureFile(seed: number): string {
  const r = rng(seed);
  const lines = ['Batch;Hours to failure'];
  for (const [name, k, lam] of [['batch A', 1.8, 1200], ['batch B', 3.2, 2100]] as const) for (let i = 0; i < 25; i++) lines.push(`${name};${(lam * (-Math.log(1 - r())) ** (1 / k)).toFixed(0)}`);
  return lines.join('\n');
}
// a Weibull probability plot (reliability): the two batches on a Weibull axis (log hours), the
// fitted Weibull lines; a P-P plot with the DKW band
function weibullExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'wb-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'failures', fileName: 'failures.txt', text: failureFile(79), textId: 'wb-1' });
  const common = { ...PROBPLOT_DEFAULTS, mode: 'raw' as const, value: 'Hours to failure', group: 'Batch', dist: 'weibull' as const, colors: ['#009E73', '#CC79A7'], symbolFill: 'filled' as const, symbolSize: 4 };
  const w = add(b, 'probplot', 'wb-prob', 640, 0, { ...common, kind: 'prob', line: 'dist', page: { ...PLOT_PAGE_DEFAULTS, name: 'weibull_plot' } });
  const pp = add(b, 'probplot', 'wb-pp', 640, 1500, { ...common, kind: 'pp', line: 'identity', band: 'dkw', legend: { show: true, x: 96, y: 96, anchor: 'br' }, page: { ...PLOT_PAGE_DEFAULTS, name: 'pp_plot' } });
  link(b, imp, w, 'dataset');
  link(b, imp, pp, 'dataset');
  const cv = add(b, 'canvas', 'wb-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 75, panels: '(a)', name: 'weibull', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 3 } });
  link(b, w, cv, 'figures', 'figure');
  link(b, pp, cv, 'figures', 'figure');
  return project(b, 'Weibull probability plot of failure times');
}

// ---- Charts: Bland–Altman (after Bland & Altman 1986) ----
// systolic pressure of the same patients by two devices at two sites; device B reads higher in the high range
function pressureFile(seed: number): string {
  const r = rng(seed);
  const lines = ['Site;Device A (mmHg);Device B (mmHg)'];
  for (let k = 0; k < 60; k++) {
    const t = 95 + 90 * r();
    lines.push(`${k < 30 ? 'clinic' : 'home'};${(t + 4 * gauss(r)).toFixed(0)};${(t * 1.05 - 4 + 5 * gauss(r)).toFixed(0)}`);
  }
  return lines.join('\n');
}
// the differences with the exact intervals of the limits (bands) and the regression on X, the points by site; the
// differences in % with limits from a regression (Bland & Altman 1999); in a Merge
function blandAltmanExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'ba-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'pressure', fileName: 'pressure.txt', text: pressureFile(83), textId: 'ba-1' });
  const common = { ...BLANDALTMAN_DEFAULTS, a: 'Device A (mmHg)', b: 'Device B (mmHg)' };
  const diff = add(b, 'blandaltman', 'ba-diff', 640, 0, { ...common, group: 'Site', ci: 'exact', regLine: true, colors: ['#0072B2', '#E69F00'], legend: { show: true, x: 4, y: 96, anchor: 'bl' }, page: { ...PLOT_PAGE_DEFAULTS, name: 'bland_altman' } });
  const pct = add(b, 'blandaltman', 'ba-pct', 640, 1500, { ...common, y: 'pct', loa: 'regression', symbolFill: 'filled', symbolSize: 4, page: { ...PLOT_PAGE_DEFAULTS, name: 'bland_altman_percent' } });
  link(b, imp, diff, 'dataset');
  link(b, imp, pct, 'dataset');
  const cv = add(b, 'canvas', 'ba-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 75, panels: '(a)', name: 'bland_altman', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 3 } });
  link(b, diff, cv, 'figures', 'figure');
  link(b, pct, cv, 'figures', 'figure');
  return project(b, 'Bland–Altman: two devices');
}

// ---- Charts: pies, doughnuts, nested rings ----
// the energy sources of a grid in two years (TWh, example values)
const ENERGY = ['Source;2014 (TWh);2024 (TWh)', 'Coal;120;48', 'Gas;95;88', 'Nuclear;70;66', 'Hydro;40;43', 'Wind;22;71', 'Solar;6;52', 'Biomass;9;12'].join('\n');
// a pie with two slices moved out, the names outside and the percents inside, a doughnut with the total in the hole, the two years as rings;
// one legend below the three (the Merge's)
function pieExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'pie-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'energy', fileName: 'energy.txt', text: ENERGY, textId: 'pie-1' });
  const pie = add(b, 'pie', 'pie-pie', 640, 0, { ...PIE_DEFAULTS, kind: 'pie', ys: '2024 (TWh)', labels: 'nameOutPercentIn', decimals: 0, hideBelow: 5, size: 100, looks: [null, null, null, null, { explode: 8 }, { explode: 8 }], page: { ...PLOT_PAGE_DEFAULTS, name: 'pie' } });
  const donut = add(b, 'pie', 'pie-donut', 640, 1500, { ...PIE_DEFAULTS, kind: 'doughnut', ys: '2024 (TWh)', hole: 0.55, sort: 'desc', labels: 'percent', labelPos: 'inside', decimals: 0, hideBelow: 5, center: 'total', page: { ...PLOT_PAGE_DEFAULTS, name: 'doughnut' } });
  const rings = add(b, 'pie', 'pie-rings', 640, 3000, { ...PIE_DEFAULTS, kind: 'rings', ys: '2024 (TWh), 2014 (TWh)', hole: 0.34, ringGap: 3, labels: 'none', center: 'text', centerText: '2024 out\n2014 in', page: { ...PLOT_PAGE_DEFAULTS, name: 'nested' } });
  for (const n of [pie, donut, rings]) link(b, imp, n, 'dataset');
  const cv = add(b, 'canvas', 'pie-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 180, height: 72, panels: '(a)', name: 'pies', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 3, hgap: 2, legend: 'bottom' } });
  for (const n of [pie, donut, rings]) link(b, n, cv, 'figures', 'figure');
  return project(b, 'Pie, doughnut and nested rings');
}

// ---- Charts: significance brackets ----
// the response of four treatments (raw values): mean ± SD bars with every pair by Welch t (Holm), boxes with each
// treatment against the control by Tukey; in a Merge
function significanceExample(): Project {
  const b = builder();
  const r = rng(89);
  const lines = ['Treatment;Response'];
  for (const [g, mu] of [['control', 20], ['low', 23], ['mid', 27], ['high', 34]] as const) for (let k = 0; k < 10; k++) lines.push(`${g};${(mu + 4 * gauss(r)).toFixed(2)}`);
  const imp = add(b, 'import', 'sg-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'response', fileName: 'response.txt', text: lines.join('\n'), textId: 'sg-1' });
  const bars = add(b, 'barchart', 'sg-bars', 640, 0, { ...BARCHART_DEFAULTS, mode: 'raw', value: 'Response', group: 'Treatment', points: true, colorBy: 'category', opacity: 0.75, legend: { show: false }, sig: { on: true, test: 'welch', adjust: 'holm', pairs: 'adjacent' }, axes: titled('', 'Response'), page: { ...PLOT_PAGE_DEFAULTS, name: 'bars_significance' } });
  const box = add(b, 'boxviolin', 'sg-box', 640, 1500, { ...BOXVIOLIN_DEFAULTS, mode: 'raw', value: 'Response', group: 'Treatment', colorBy: 'category', points: 'swarm', opacity: 0.5, legend: { show: false }, sig: { on: true, test: 'tukey', pairs: 'control', show: 'both', ns: true }, axes: titled('', 'Response'), page: { ...PLOT_PAGE_DEFAULTS, name: 'boxes_significance' } });
  link(b, imp, bars, 'dataset');
  link(b, imp, box, 'dataset');
  const cv = add(b, 'canvas', 'sg-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 80, panels: '(a)', name: 'significance', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 4 } });
  link(b, bars, cv, 'figures', 'figure');
  link(b, box, cv, 'figures', 'figure');
  return project(b, 'Significance brackets on bars and boxes');
}

// ---- Charts: contour / heatmap ----
// a reflectance map R(λ, θ) as a matrix: the angle in the first column, a column per wavelength; a dip (a resonance)
// moving to longer wavelengths with the angle
function reflectanceMatrix(): string {
  const wl = Array.from({ length: 31 }, (_, i) => 500 + 10 * i);
  const lines = [['Angle (°)', ...wl.map((w) => `R ${w} nm`)].join(';')];
  for (let a = 0; a <= 60; a += 2) {
    const c = 560 + 0.06 * a * a;
    lines.push([a, ...wl.map((w) => (1 - (0.85 * 30 ** 2) / ((w - c) ** 2 + 30 ** 2)).toFixed(4))].join(';'));
  }
  return lines.join('\n');
}
// scattered measurements of a surface (random points of a smooth function)
function scatteredSurface(seed: number): string {
  const r = rng(seed);
  const lines = ['x;y;z'];
  for (let k = 0; k < 250; k++) {
    const [x, y] = [-3 + 6 * r(), -2 + 4 * r()];
    lines.push(`${x.toFixed(4)};${y.toFixed(4)};${((1 - x / 2 + x ** 5 + y ** 3) * Math.exp(-(x * x) - y * y)).toFixed(5)}`);
  }
  return lines.join('\n');
}
// the map smooth with its contour lines and a row cut at 30°; the cut as a curve; scattered points as filled levels
function contourExample(): Project {
  const b = builder();
  const mat = add(b, 'import', 'ct-matrix', 0, 0, { ...IMPORT_DEFAULTS, name: 'reflectance', fileName: 'reflectance_map.txt', text: reflectanceMatrix(), textId: 'ct-1' });
  const map = add(b, 'contour', 'ct-map', 640, 0, { ...CONTOUR_DEFAULTS, layout: 'matrix', xTitle: 'Wavelength (nm)', draw: 'heatLines', smooth: true, cmap: 'inferno', levels: 'list', list: '0.2, 0.4, 0.6, 0.8', lineColor: '#ffffff', lineLabels: true, lineWidth: 0.5, zTitle: 'Reflectance', profileY: 30, profileShow: true, axes: titled('Wavelength (nm)', 'Angle (°)'), page: { ...PLOT_PAGE_DEFAULTS, name: 'reflectance_map' } });
  link(b, mat, map, 'dataset');
  const cut = add(b, 'plot1d', 'ct-cut', 1400, 0, { ...plot({ label: 'θ = 30°', style: curve(2, { lineWidth: 1.2 }), cols: { x: 'Wavelength (nm)', y: 'Reflectance' } }, { page: { name: 'cut_30deg' } }) });
  link(b, map, cut, 'dataset', 'row');
  const sc = add(b, 'import', 'ct-scatter', 0, 1500, { ...IMPORT_DEFAULTS, name: 'surface', fileName: 'surface_points.txt', text: scatteredSurface(97), textId: 'ct-2', edits: roles({ 0: 'x', 1: 'y', 2: 'y' }) });
  const tri = add(b, 'contour', 'ct-tri', 640, 1500, { ...CONTOUR_DEFAULTS, draw: 'filledLines', cmap: 'rdbu', reverse: true, nLevels: 12, lineWidth: 0.4, page: { ...PLOT_PAGE_DEFAULTS, name: 'scattered_filled' } });
  link(b, sc, tri, 'dataset');
  const cv = add(b, 'canvas', 'ct-canvas', 2100, 0, { ...CANVAS_DEFAULTS, width: 180, height: 60, panels: '(a)', name: 'contours', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 3, hgap: 4 } });
  for (const n of [map, cut, tri]) link(b, n, cv, 'figures', 'figure');
  return project(b, 'Contour and heatmap: a reflectance map, scattered points');
}

// ---- Analysis: matrices ----
// a symmetric positive definite A and a vector b typed in: A⁻¹ (and A⁻¹·A = I), det A, the eigenvalues and vectors,
// the SVD, the solution of A·x = b; A⁻¹ and the eigenvectors drawn with their values in the cells; the reflectance map
// of the Contour example read as a matrix (its X and Y kept) and drawn as a map
function matrixExample(): Project {
  const b = builder();
  const A = add(b, 'matrix', 'mx-a', 0, 0, { ...MATRIX_DEFAULTS, name: 'A', text: '4\t1\t2\t0.5\n1\t3\t0\t1\n2\t0\t5\t1.5\n0.5\t1\t1.5\t2' });
  const v = add(b, 'matrix', 'mx-b', 0, 700, { ...MATRIX_DEFAULTS, name: 'b', text: '1\n2\n3\n4' });
  const comp = add(b, 'matcomp', 'mx-comp', 640, 0, {
    steps: [
      { id: 's1', name: 'Ainv', op: 'inverse', a: 'A' },
      { id: 's2', name: 'check', op: 'matmul', a: '@s1', b: 'A' },
      { id: 's3', name: 'detA', op: 'det', a: 'A' },
      { id: 's4', name: 'eig', op: 'eig', a: 'A' },
      { id: 's5', name: 'svd', op: 'svd', a: 'A' },
      { id: 's6', name: 'x', op: 'solve', a: 'A', b: 'B' },
    ],
  });
  link(b, A, comp, 'in-0');
  link(b, v, comp, 'in-1');
  const cells = { ...MATRIX_CONTOUR_DEFAULTS, cellValues: true, cellDecimals: 3 };
  const inv = add(b, 'contour', 'mx-inv', 1400, 0, { ...cells, cmap: 'rdbu', reverse: true, zTitle: 'A^{−1}', page: { ...PLOT_PAGE_DEFAULTS, width: 70, height: 60, name: 'inverse' } });
  link(b, comp, inv, 'matrix', 's-s1');
  const vec = add(b, 'contour', 'mx-vec', 1400, 1500, { ...cells, cmap: 'coolwarm', zMin: -1, zMax: 1, zTitle: 'eigenvectors', page: { ...PLOT_PAGE_DEFAULTS, width: 70, height: 60, name: 'eigenvectors' } });
  link(b, comp, vec, 'matrix', 's-s4-vectors');
  // a map as a matrix: the rows' Y (the angle) and the columns' X (the wavelength in their names) kept
  const imp = add(b, 'import', 'mx-map', 0, 1500, { ...IMPORT_DEFAULTS, name: 'reflectance', fileName: 'reflectance_map.txt', text: reflectanceMatrix(), textId: 'mx-1' });
  const R = add(b, 'matrix', 'mx-r', 640, 1500, { ...MATRIX_DEFAULTS, source: 'dataset', name: 'R' });
  link(b, imp, R, 'in');
  const tight = { x: { ...AXIS_DEFAULTS, range: 'tight' as const }, y: { ...AXIS_DEFAULTS, range: 'tight' as const } };
  const map = add(b, 'contour', 'mx-plot-map', 1400, 3000, { ...MATRIX_CONTOUR_DEFAULTS, axesFrom: 'coords', rowOne: 'bottom', square: false, smooth: true, cmap: 'inferno', zTitle: 'Reflectance', axes: titled('Wavelength (nm)', 'Angle (°)', tight), page: { ...PLOT_PAGE_DEFAULTS, width: 80, height: 60, name: 'map' } });
  link(b, R, map, 'matrix');
  const cv = add(b, 'canvas', 'mx-canvas', 2200, 0, { ...CANVAS_DEFAULTS, width: 180, height: 60, panels: '(a)', name: 'matrices', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 3, hgap: 6 } });
  for (const n of [inv, vec, map]) link(b, n, cv, 'figures', 'figure');
  return project(b, 'Matrices: inverse, eigenvalues, SVD, a map as a matrix');
}

// ---- Charts: polar, wind rose and radar ----
// a half-wave dipole's gain (dB) every 2°; a month of wind directions and speeds; three materials scored on six
// properties
function polarExample(): Project {
  const b = builder();
  const dip = ['Angle (°);Gain (dB)', ...Array.from({ length: 91 }, (_, k) => {
    const th = (2 * k * Math.PI) / 180;
    const g = Math.sin(th) < 1e-6 ? 1e-6 : (Math.cos((Math.PI / 2) * Math.cos(th)) / Math.sin(th)) ** 2;
    return `${2 * k};${Math.max(-40, 10 * Math.log10(Math.max(g, 1e-6))).toFixed(3)}`;
  })].join('\n');
  const wind = ['Direction (°);Hours'].concat([0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5].map((a, k) => `${a};${[42, 30, 18, 12, 9, 11, 16, 25, 33, 48, 70, 88, 76, 61, 52, 47][k]}`)).join('\n');
  const radar = ['Property;Steel;Aluminium;CFRP', 'Strength;8;4;9', 'Stiffness;9;5;7', 'Lightness;2;7;9', 'Cost;8;6;2', 'Corrosion;3;7;8', 'Fatigue;7;4;8'].join('\n');
  const i1 = add(b, 'import', 'po-dipole', 0, 0, { ...IMPORT_DEFAULTS, name: 'dipole', fileName: 'dipole_gain.txt', text: dip, textId: 'po-1' });
  const i2 = add(b, 'import', 'po-wind', 0, 1500, { ...IMPORT_DEFAULTS, name: 'wind', fileName: 'wind.txt', text: wind, textId: 'po-2' });
  const i3 = add(b, 'import', 'po-radar', 0, 3000, { ...IMPORT_DEFAULTS, name: 'materials', fileName: 'materials.txt', text: radar, textId: 'po-3' });
  const p1 = add(b, 'polar', 'po-p1', 640, 0, { ...POLAR_DEFAULTS, zero: 'N', clockwise: true, from: 0, to: 180, rMin: -30, rMax: 0, thetaStep: 30, fill: true, opacity: 0.2, colors: ['#0072B2'], legend: { show: false }, page: { ...PLOT_PAGE_DEFAULTS, name: 'dipole' } });
  const p2 = add(b, 'polar', 'po-p2', 640, 1500, { ...POLAR_DEFAULTS, mode: 'bars', zero: 'N', clockwise: true, thetaStep: 45, thetaLabels: 'compass', colors: ['#D55E00'], legend: { show: false }, page: { ...PLOT_PAGE_DEFAULTS, name: 'wind_rose' } });
  const p3 = add(b, 'polar', 'po-p3', 640, 3000, { ...POLAR_DEFAULTS, kind: 'radar', mode: 'linesymbol', fill: true, rMin: 0, rMax: 10, legend: { show: false }, page: { ...PLOT_PAGE_DEFAULTS, name: 'radar' } });
  link(b, i1, p1, 'dataset');
  link(b, i2, p2, 'dataset');
  link(b, i3, p3, 'dataset');
  const cv = add(b, 'canvas', 'po-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 180, height: 65, panels: '(a)', name: 'polar', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 3, hgap: 3, legend: 'bottom' } });
  for (const n of [p1, p2, p3]) link(b, n, cv, 'figures', 'figure');
  return project(b, 'Polar: antenna pattern, wind rose, radar');
}

// ---- Charts: scatter matrix ----
// four measures of flowers of three species (example values in the manner of Fisher's iris data)
function flowersFile(seed: number): string {
  const r = rng(seed);
  const lines = ['Species;Sepal length (cm);Sepal width (cm);Petal length (cm);Petal width (cm)'];
  for (const [sp, sl, sw, pl, pw] of [['setosa', 5.0, 3.4, 1.5, 0.25], ['versicolor', 5.9, 2.8, 4.3, 1.3], ['virginica', 6.6, 3.0, 5.5, 2.0]] as const)
    for (let k = 0; k < 30; k++) {
      const size = gauss(r);
      lines.push([sp, (sl + 0.35 * size + 0.15 * gauss(r)).toFixed(1), (sw + 0.2 * size * (sp === 'setosa' ? 1.2 : 0.6) + 0.2 * gauss(r)).toFixed(1), (pl + 0.3 * size * (sp === 'setosa' ? 0.2 : 1) + 0.15 * gauss(r)).toFixed(1), Math.max(0.1, pw + 0.12 * size * (sp === 'setosa' ? 0.3 : 1) + 0.08 * gauss(r)).toFixed(1)].join(';'));
    }
  return lines.join('\n');
}
function scatterMatrixExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'sm-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'flowers', fileName: 'flowers.txt', text: flowersFile(101), textId: 'sm-1' });
  const m = add(b, 'scattermatrix', 'sm-matrix', 640, 0, { ...SCATTERMATRIX_DEFAULTS, group: 'Species', diag: 'kde', upper: 'corr', colors: ['#0072B2', '#E69F00', '#009E73'], page: { ...PLOT_PAGE_DEFAULTS, width: 160, height: 150, name: 'scatter_matrix' } });
  link(b, imp, m, 'dataset');
  return project(b, 'Scatter matrix of four measures, three species');
}

// ---- Charts: waterfall (bridge) chart ----
// a year's result of a small laboratory, from the grants to what is left (k€, example values)
function waterfallExample(): Project {
  const b = builder();
  const text = ['Item;Change (k€)', 'Grants;420', 'Services;85', 'Salaries;-260', 'Equipment;-95', 'Consumables;-48', 'Travel;-22', 'Overheads;-40'].join('\n');
  const imp = add(b, 'import', 'wf-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'budget', fileName: 'budget.txt', text, textId: 'wf-1' });
  const wf = add(b, 'barchart', 'wf-chart', 640, 0, { ...BARCHART_DEFAULTS, arrange: 'waterfall', labels: 'top', decimals: 0, width: 0.7, edgeWidth: 0, legend: { show: true, x: 96, y: 4, anchor: 'tr' }, barLook: { radius: 1.5 }, axes: titled('', 'k€'), page: { ...PLOT_PAGE_DEFAULTS, width: 160, name: 'waterfall' } });
  link(b, imp, wf, 'dataset');
  return project(b, 'Waterfall: from the grants to the balance');
}

// ---- Charts: ternary (the soil texture triangle) ----
// the sand, silt and clay of soil samples from three sites; an alloy's composition along a diffusion couple
function ternaryExample(): Project {
  const b = builder();
  const r = rng(103);
  const soil = ['Site;Sand (%);Silt (%);Clay (%)'];
  for (const [site, sa, si] of [['river', 65, 25], ['plateau', 25, 50], ['valley', 35, 30]] as const)
    for (let k = 0; k < 15; k++) {
      const s = Math.max(1, sa + 7 * gauss(r));
      const t = Math.max(1, si + 6 * gauss(r));
      soil.push(`${site};${s.toFixed(1)};${t.toFixed(1)};${Math.max(1, 100 - s - t).toFixed(1)}`);
    }
  const path = ['Distance (µm);Fe;Ni;Cr', ...Array.from({ length: 11 }, (_, k) => {
    const f = k / 10;
    return `${10 * k};${(0.7 - 0.45 * f).toFixed(3)};${(0.1 + 0.55 * f * f).toFixed(3)};${(0.2 - 0.1 * f + 0.1 * Math.sin(Math.PI * f)).toFixed(3)}`;
  })];
  const i1 = add(b, 'import', 'tn-soil', 0, 0, { ...IMPORT_DEFAULTS, name: 'soil', fileName: 'soil.txt', text: soil.join('\n'), textId: 'tn-1' });
  const i2 = add(b, 'import', 'tn-path', 0, 1500, { ...IMPORT_DEFAULTS, name: 'diffusion', fileName: 'couple.txt', text: path.join('\n'), textId: 'tn-2' });
  const t1 = add(b, 'ternary', 'tn-t1', 640, 0, { ...TERNARY_DEFAULTS, a: 'Clay (%)', b: 'Sand (%)', c: 'Silt (%)', group: 'Site', scale: 'percent', colors: ['#0072B2', '#E69F00', '#009E73'], legend: { show: true, x: 100, y: 0, anchor: 'tr' }, page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 75, name: 'soil_texture' } });
  const t2 = add(b, 'ternary', 'tn-t2', 640, 1500, { ...TERNARY_DEFAULTS, a: 'Fe', b: 'Ni', c: 'Cr', mode: 'linesymbol', step: 0.2, symbolFill: 'white', colors: ['#CC79A7'], legend: { show: false }, page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 75, name: 'diffusion_path' } });
  link(b, i1, t1, 'dataset');
  link(b, i2, t2, 'dataset');
  const cv = add(b, 'canvas', 'tn-canvas', 1400, 0, { ...CANVAS_DEFAULTS, width: 170, height: 75, panels: '(a)', name: 'ternary', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 4 } });
  link(b, t1, cv, 'figures', 'figure');
  link(b, t2, cv, 'figures', 'figure');
  return project(b, 'Ternary: soil texture, a diffusion path');
}

// ---- Charts: waterfall of curves and ridgeline plots ----
// (a) the reflectance of a microcavity for 23 thicknesses (the strong-coupling data): one behind the other, the curves in
// front hiding those behind, coloured by the thickness with a colour bar, the thickness written at each; (b) the
// photoluminescence of a sample from 10 to 300 K, each spectrum to its maximum, filled in its colour (a ridgeline)
function curvesWaterfallExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'wf-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'strong coupling', fileName: 'strong_coupling_spr_forge.csv', text: strongCouplingTable(), textId: 'wf-1', edits: { cols: { 0: { role: 'none' }, 1: { role: 'x' }, 2: { role: 'y' } } } });
  const split = add(b, 'unstack', 'wf-split', 640, 0, { ...UNSTACK_DEFAULTS, x: 'Wavelength (nm)', ys: 'R', by: 'column', column: 'cavity d (nm)' });
  link(b, imp, split, 'in');
  const w1 = add(b, 'waterfall', 'wf-r', 1240, 0, { ...WATERFALL_DEFAULTS, dx: 0, dy: 9, colorMap: 'plasma', reverse: true, zTitle: 'Cavity d (nm)', labels: 'right', labelText: '{z}', labelSize: 5, lineWidth: 0.8, axes: titled('Wavelength (nm)', 'Reflectance (shifted)'), page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 110, name: 'reflectance_waterfall' } });
  link(b, split, w1, 'dataset');
  // PL spectra: a band that moves to the red and widens with the temperature, a second one that fades
  const r = rng(211);
  const temps = [10, 50, 100, 150, 200, 250, 300];
  const pl = [['Energy (eV)', ...temps.map((t) => `PL ${t} K`)].join(';')];
  for (let k = 0; k <= 200; k++) {
    const e = 1.3 + (0.5 * k) / 200;
    pl.push([e.toFixed(4), ...temps.map((t) => {
      const c = 1.6 - 0.00045 * t;
      const w = 0.02 + 0.00012 * t;
      const v = Math.exp(-(((e - c) / w) ** 2) / 2) + 0.6 * Math.exp(-t / 90) * Math.exp(-(((e - c + 0.09) / 0.025) ** 2) / 2) + 0.01 * gauss(r);
      return v.toFixed(4);
    })].join(';'));
  }
  const i2 = add(b, 'import', 'wf-pl', 0, 1500, { ...IMPORT_DEFAULTS, name: 'photoluminescence', fileName: 'pl_temperature.txt', text: pl.join('\n'), textId: 'wf-2' });
  const w2 = add(b, 'waterfall', 'wf-ridge', 1240, 1500, { ...WATERFALL_DEFAULTS, dx: 0, dy: 70, normalize: 'max', front: 'last', fill: 'color', fillOpacity: 0.55, colorMap: 'coolwarm', colorbar: false, labels: 'leftIn', labelText: '{z} K', labelColor: '#333333', lineWidth: 0.8, axes: axes({ sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Energy (eV)' }), left: side({ title: '', showTitle: false, labels: false, ticks: 'none' }) } }), page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 110, name: 'pl_ridgeline' } });
  link(b, i2, w2, 'dataset');
  const cv = add(b, 'canvas', 'wf-canvas', 1900, 0, { ...CANVAS_DEFAULTS, width: 170, height: 110, panels: '(a)', name: 'waterfall', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 4 } });
  link(b, w1, cv, 'figures', 'figure');
  link(b, w2, cv, 'figures', 'figure');
  return project(b, 'Waterfall: reflectance vs thickness, a PL ridgeline');
}

// ---- Charts: 3D ----
// (a) two Gaussian peaks and a dip as a surface, its contour lines on the floor; (b) a year's monthly rainfall at four
// stations as 3D bars (a matrix); (c) three clusters of points (symbols, lines down to the floor); (d) the microcavity's
// reflectance for every thickness in depth (a 3D waterfall with walls)
function plot3dExample(): Project {
  const b = builder();
  const r = rng(307);
  const surf = ['x;y;z'];
  for (let j = 0; j <= 40; j++)
    for (let i = 0; i <= 40; i++) {
      const [x, y] = [-3 + (6 * i) / 40, -3 + (6 * j) / 40];
      surf.push(`${x.toFixed(3)};${y.toFixed(3)};${(Math.exp(-((x - 1) ** 2 + (y - 0.5) ** 2)) + 0.7 * Math.exp(-((x + 1.2) ** 2 + (y + 1) ** 2) / 0.6) - 0.4 * Math.exp(-((x + 0.5) ** 2 + (y - 1.8) ** 2) / 0.4)).toFixed(4)}`);
    }
  const i1 = add(b, 'import', 'p3-surf', 0, 0, { ...IMPORT_DEFAULTS, name: 'peaks', fileName: 'peaks.txt', text: surf.join('\n'), textId: 'p3-1' });
  const s = add(b, 'plot3d', 'p3-s', 640, 0, { ...PLOT3D_DEFAULTS, kind: 'surface', cmap: 'viridis', mesh: 4, meshColor: '#2b2b2b', meshWidth: 0.25, floor: 'contour', floorLevels: 10, titleZ: 'z', page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 70, name: 'surface' } });
  link(b, i1, s, 'dataset');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const rain = ['Station;' + months.map((_, k) => `${k + 1} month`).join(';')];
  [1, 2, 3, 4].forEach((st) => rain.push(`${st};${months.map((_, k) => Math.max(5, 60 + 40 * Math.sin(((k - 2 + st) / 12) * 2 * Math.PI) + 15 * st + 10 * gauss(r)).toFixed(0)).join(';')}`));
  const i2 = add(b, 'import', 'p3-rain', 0, 1500, { ...IMPORT_DEFAULTS, name: 'rainfall', fileName: 'rainfall.txt', text: rain.join('\n'), textId: 'p3-2' });
  const bars = add(b, 'plot3d', 'p3-b', 640, 1500, { ...PLOT3D_DEFAULTS, kind: 'bars', layout: 'matrix', yCol: 'Station', xTitle: 'Month', cmap: 'plasma', barWidth: 0.7, barEdge: '#333333', titleZ: 'Rain (mm)', azim: -55, elev: 28, aspectX: 1.6, page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 70, name: 'bars3d' } });
  link(b, i2, bars, 'dataset');
  const pts = ['Cluster;x;y;z'];
  for (const [name, cx, cy, cz] of [['A', 0, 0, 0], ['B', 3, 1, 2], ['C', 1, 3, 4]] as const)
    for (let k = 0; k < 30; k++) pts.push(`${name};${(cx + 0.6 * gauss(r)).toFixed(3)};${(cy + 0.6 * gauss(r)).toFixed(3)};${(cz + 0.6 * gauss(r)).toFixed(3)}`);
  const i3 = add(b, 'import', 'p3-pts', 0, 3000, { ...IMPORT_DEFAULTS, name: 'clusters', fileName: 'clusters.txt', text: pts.join('\n'), textId: 'p3-3' });
  const sc = add(b, 'plot3d', 'p3-c', 640, 3000, { ...PLOT3D_DEFAULTS, kind: 'scatter', x: 'x', y: 'y', z: 'z', group: 'Cluster', colorBy: 'group', colors: ['#0072B2', '#E69F00', '#009E73'], drop: true, symbolSize: 4, page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 70, name: 'scatter3d' } });
  link(b, i3, sc, 'dataset');
  const i4 = add(b, 'import', 'p3-sc', 0, 4500, { ...IMPORT_DEFAULTS, name: 'strong coupling', fileName: 'strong_coupling_spr_forge.csv', text: strongCouplingTable(), textId: 'p3-4', edits: { cols: { 0: { role: 'none' }, 1: { role: 'x' }, 2: { role: 'y' } } } });
  const split = add(b, 'unstack', 'p3-split', 640, 4500, { ...UNSTACK_DEFAULTS, x: 'Wavelength (nm)', ys: 'R', by: 'column', column: 'cavity d (nm)' });
  link(b, i4, split, 'in');
  const wf = add(b, 'plot3d', 'p3-w', 1240, 4500, { ...PLOT3D_DEFAULTS, kind: 'waterfall', cmap: 'plasma', reverse: true, lineWidth: 0.8, wallOpacity: 0.08, titleY: 'Cavity d (nm)', titleZ: 'R', azim: -70, elev: 25, aspectY: 1.4, colorbar: false, page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 70, name: 'waterfall3d' } });
  link(b, split, wf, 'dataset');
  const cv = add(b, 'canvas', 'p3-canvas', 1900, 0, { ...CANVAS_DEFAULTS, width: 170, height: 140, panels: '(a)', name: 'plots3d', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 2, cols: 2, hgap: 3, vgap: 3 } });
  for (const p of [s, bars, sc, wf]) link(b, p, cv, 'figures', 'figure');
  return project(b, '3D: a surface, bars, clusters, a waterfall');
}

// ---- Charts: 3D stacked maps (reciprocal space maps of five GaN samples, two reflections) ----
// Every sample's map on a 50 × 50 grid in Qx, Qz (example values): a tilted main spot and a weaker one beside it over a
// noisy background; the counts below 8 left out, the colours on a log scale, one colour bar in the Merge for both.
function rsmFile(seed: number, qx: [number, number], qz: [number, number], spots: (k: number) => { x: number; z: number; sx: number; sz: number; tilt: number; a: number }[]): string {
  const r = rng(seed);
  const lines = ['Sample;Qx (1/Å);Qz (1/Å);Intensity (counts)'];
  for (let k = 0; k < 5; k++)
    for (let j = 0; j < 50; j++)
      for (let i = 0; i < 50; i++) {
        const x = qx[0] + ((qx[1] - qx[0]) * i) / 49;
        const z = qz[0] + ((qz[1] - qz[0]) * j) / 49;
        let v = 2;
        for (const s of spots(k)) {
          const [u, w] = [(x - s.x) * Math.cos(s.tilt) + (z - s.z) * Math.sin(s.tilt), -(x - s.x) * Math.sin(s.tilt) + (z - s.z) * Math.cos(s.tilt)];
          v += s.a * Math.exp(-((u / s.sx) ** 2 + (w / s.sz) ** 2) / 2);
        }
        v = Math.max(0, v * (1 + 0.35 * gauss(r)) + 1.5 * gauss(r));
        lines.push(`S${k + 1};${x.toFixed(5)};${z.toFixed(5)};${v.toFixed(1)}`);
      }
  return lines.join('\n');
}
function rsmExample(): Project {
  const b = builder();
  const i1 = add(b, 'import', 'rsm-0002', 0, 0, { ...IMPORT_DEFAULTS, name: 'GaN 0002', fileName: 'rsm_0002.txt', textId: 'rsm-1', edits: roles({ 0: 'label', 1: 'x', 2: 'y', 3: 'y' }), text: rsmFile(311, [-0.02, 0.02], [0.37, 0.41], (k) => [{ x: 0, z: 0.383 + 0.0012 * k, sx: 0.0035 + 0.0012 * k, sz: 0.0012, tilt: -0.5 + 0.12 * k, a: 3000 / (1 + 0.4 * k) }, { x: 0.011, z: 0.389 + 0.001 * k, sx: 0.0012, sz: 0.0008, tilt: 0, a: 400 }]) });
  const i2 = add(b, 'import', 'rsm-1124', 0, 1500, { ...IMPORT_DEFAULTS, name: 'GaN 11-24', fileName: 'rsm_1124.txt', textId: 'rsm-2', edits: roles({ 0: 'label', 1: 'x', 2: 'y', 3: 'y' }), text: rsmFile(313, [0.62, 0.66], [0.75, 0.79], (k) => [{ x: 0.645, z: 0.758 + 0.003 * k, sx: 0.003, sz: 0.0016, tilt: 0.6, a: 60 / (1 + 0.8 * k) }]) });
  const look = { ...PLOT3D_DEFAULTS, kind: 'layers' as const, bins: 50, cmap: 'turbo' as const, logColor: true, hide: { below: 8 }, layerAxis: 'none' as const, colorbar: false, panes: '', gridColor: '#bdbdbd', gridWalls: 'floor' as const, gridMinor: true, edges: 'all' as const, azim: -50, elev: 22, aspectZ: 1.6, titleX: 'Q_{x} (Å^{−1})', titleY: 'Q_{z} (Å^{−1})', ticks: 4 };
  const title = (t: string) => note('title', 'text', { ...TEXT_SPEC_DEFAULTS, text: t, x: 50, y: 1, anchor: 'tc', style: { size: 11 } });
  const p1 = add(b, 'plot3d', 'rsm-p1', 640, 0, { ...look, marks: [{ id: 'axis', type: 'vline', x1: 0, y1: 0.385, z1: NaN, z2: NaN, x2: NaN, y2: NaN, color: '#000000', width: 0.8, dash: 'dash' }, { id: 'box', type: 'rect', x1: -0.01, x2: 0.01, y1: 0.379, y2: 0.386, z1: NaN, z2: NaN, color: '#e41a1c', width: 0.8, dash: 'dash' }], annotations: [title('GaN 0002')], page: { ...PLOT_PAGE_DEFAULTS, width: 80, height: 110, name: 'rsm_0002' } });
  const p2 = add(b, 'plot3d', 'rsm-p2', 640, 1500, { ...look, marks: [{ id: 'axis', type: 'vline', x1: 0.645, y1: 0.765, z1: NaN, z2: NaN, x2: NaN, y2: NaN, color: '#000000', width: 0.8, dash: 'dash' }], annotations: [title('GaN 11\\overline{2}4')], page: { ...PLOT_PAGE_DEFAULTS, width: 80, height: 110, name: 'rsm_1124' } });
  link(b, i1, p1, 'dataset');
  link(b, i2, p2, 'dataset');
  const cv = add(b, 'canvas', 'rsm-canvas', 1300, 0, { ...CANVAS_DEFAULTS, width: 180, height: 110, panels: 'none', name: 'rsm_stack', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 3, colRatios: '1:1:0.16', oneColorScale: true }, annotations: [note('bar', 'colorbar', { ...COLORBAR_DEFAULTS, x: 92, y: 18, length: 64, thickness: 7, title: 'Intensity (counts)' })] });
  link(b, p1, cv, 'figures', 'figure');
  link(b, p2, cv, 'figures', 'figure');
  return project(b, '3D stacked maps: RSMs of five samples');
}


// ---- Spectroscopy, kinetics, signals and statistics (the analysis of 2026-10) ----
const spec = (name: string, value = NaN, fixed = false): FitParamSpec => ({ name, value, fixed, min: NaN, max: NaN, shared: false });
const dots = (k: number, size = 2.5): CurveStyle => curve(k, { mode: 'scatter', symbol: 'circle', symbolSize: size });
const lineK = (k: number, patch: Partial<CurveStyle> = {}): CurveStyle => curve(k, { lineWidth: 1.2, ...patch });

// a Ni 2p photoelectron spectrum: the 2p3/2 and 2p1/2 lines (17.3 eV apart, half the area) on a Shirley background
function xpsFile(): string {
  const r = rng(21);
  const V = (x: number, c: number, w: number) => 0.6 / (1 + ((2 * (x - c)) / w) ** 2) + 0.4 * Math.exp((-4 * Math.LN2 * (x - c) ** 2) / (w * w));
  const xs: number[] = [];
  for (let x = 845; x <= 880.001; x += 0.1) xs.push(+x.toFixed(2));
  const peak = xs.map((x) => 3000 * V(x, 852.6, 1.6) + 1500 * V(x, 869.9, 1.6));
  // the step under them: proportional to the area of the lines at lower energy
  let acc = 0;
  const step = peak.map((p) => (acc += p));
  const lines = ['Binding energy (eV);Intensity (counts/s)'];
  xs.forEach((x, i) => lines.push(x + ';' + (400 + (500 * step[i]) / acc + peak[i] + 25 * gauss(r)).toFixed(1)));
  return lines.join('\n');
}
function xpsExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'xps-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'Ni 2p', fileName: 'ni2p.txt', text: xpsFile(), textId: 'xps-1' });
  const pk = add(b, 'peaks', 'xps-peaks', 640, 0, { ...PEAK_DEFAULTS, baseline: 'shirley', fit: true, subtract: false, peaks: [{ shape: 'voigtx', x: 852.5, doublet: { dx: 17.3, ratio: 0.5 } }] });
  link(b, imp, pk, 'in');
  const X = 'Binding energy (eV)';
  const pl = add(b, 'plot1d', 'xps-plot', 1300, 0, {
    ...plot(
      {
        label: 'data',
        style: dots(7, 2),
        cols: { x: X, y: 'Intensity (counts/s)' },
        rows: [
          { label: 'Shirley background', style: lineK(7, { dash: 'dash' }), cols: { x: X, y: 'baseline' } },
          { label: '2p3/2', style: lineK(1, { fill: 'curve', fillCurve: 1, fillOpacity: 0.3 }), cols: { x: X, y: 'peak 1' } },
          { label: '2p1/2 (its doublet)', style: lineK(2, { fill: 'curve', fillCurve: 1, fillOpacity: 0.3 }), cols: { x: X, y: 'peak 2' } },
          { label: 'envelope', style: lineK(0, { color: '#111111' }), cols: { x: X, y: 'envelope' } },
        ],
      },
      { legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'ni2p' } },
    ),
  });
  link(b, pk, pl, 'dataset', 'out');
  add(b, 'note', 'xps-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'Photoelectron spectrum of Ni 2p (example values).\n\nPeak analyzer: the Shirley background (found again until it stays: it rises under each line in proportion to its area), one peak of the exact Voigt shape with 2× on — a spin–orbit doublet: its partner 17.3 eV higher, half the area, the same widths, linked to it in the fit.\n\nThe table of the peaks gives both lines (the second marked as the doublet of the first); the Plot draws the data, the background, the two lines filled down to it, and their sum.',
  });
  return project(b, 'XPS: Shirley background and a spin–orbit doublet');
}

// Raman lines on a strong fluorescence background
function ramanFile(): string {
  const r = rng(33);
  const L = (x: number, c: number, w: number) => 1 / (1 + ((2 * (x - c)) / w) ** 2);
  const lines = ['Raman shift (cm⁻¹);Intensity (counts)'];
  for (let x = 400; x <= 1800; x += 2) {
    const bg = 4000 + 3000 * Math.exp(-(((x - 1300) / 700) ** 2)) + 0.4 * (x - 400);
    const y = bg + 2500 * L(x, 1001, 8) + 700 * L(x, 1031, 9) + 900 * L(x, 1155, 12) + 1200 * L(x, 1450, 18) + 60 * gauss(r);
    lines.push(x + ';' + y.toFixed(1));
  }
  return lines.join('\n');
}
function ramanBaselineExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'rb-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'Raman', fileName: 'raman_fluorescence.txt', text: ramanFile(), textId: 'rb-1' });
  const pk = add(b, 'peaks', 'rb-peaks', 640, 0, { ...PEAK_DEFAULTS, baseline: 'airpls', baseOpt: { lambda: 6 }, fit: true, subtract: false, peaks: [1001, 1031, 1155, 1450].map((x) => ({ shape: 'lorentz' as const, x })) });
  link(b, imp, pk, 'in');
  const area = add(b, 'calculus', 'rb-area', 640, 900, { ...CALCULUS_DEFAULTS, op: 'int', baseline: 'asls', baseOpt: { lambda: 4, p: 0.01 }, regions: [{ lo: 960, hi: 1060 }, { lo: 1380, hi: 1520 }] });
  link(b, imp, area, 'in');
  const width = add(b, 'peakwidth', 'rb-width', 1300, 900, { ...PEAKWIDTH_DEFAULTS, kind: 'peak', base: 'snip', baseOpt: { width: 15 }, regions: [{ lo: 960, hi: 1060 }, { lo: 1100, hi: 1220 }] });
  link(b, imp, width, 'in');
  const X = 'Raman shift (cm⁻¹)';
  const pl = add(b, 'plot1d', 'rb-plot', 1300, 0, {
    ...plot(
      {
        label: 'measured',
        style: dots(7, 1.6),
        cols: { x: X, y: 'Intensity (counts)' },
        rows: [
          { label: 'baseline (airPLS)', style: lineK(3, { dash: 'dash' }), cols: { x: X, y: 'baseline' } },
          { label: 'fit: baseline + 4 Lorentzians', style: lineK(1), cols: { x: X, y: 'envelope' } },
        ],
      },
      { legend: { x: 4, y: 4, anchor: 'tl' }, page: { name: 'raman_baseline' } },
    ),
  });
  link(b, pk, pl, 'dataset', 'out');
  add(b, 'note', 'rb-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'A Raman spectrum on a fluorescence background ten times its lines (example values).\n\nThe same list of baselines in three nodes, each found from the data, the lines left above it:\n• Peak analyzer — airPLS (smoothness 10^6), the four lines of the list fitted (the weak one at 1031 cm⁻¹ beside the strong one at 1001);\n• Integrate — asymmetric least squares in every range (smoothness 10^4, asymmetry 0.01): the areas of the 1001 cm⁻¹ line and of the 1450 band;\n• Peak width — SNIP (a window of 15 points): the FWHM of two lines.',
  });
  return project(b, 'Raman on a fluorescence background: baselines from the data');
}

// standards and two unknowns read off a straight-line calibration
function calibrationExample(): Project {
  const b = builder();
  const r = rng(5);
  const cs = [0, 0.5, 1, 2, 4, 6, 8, 10];
  const rows = ['c (mg/L);A;±A'];
  for (const c of cs) {
    const a = 0.012 + 0.0832 * c + 0.004 * gauss(r);
    rows.push(c + ';' + a.toFixed(4) + ';0.004');
  }
  const imp = add(b, 'import', 'cal-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'standards', fileName: 'standards.txt', text: rows.join('\n'), textId: 'cal-1', edits: { cols: { 0: { role: 'x' }, 1: { role: 'y' }, 2: { role: 'yerr' } } } });
  const fit = add(b, 'fit', 'cal-fit', 640, 0, { ...FIT_DEFAULTS, model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'linear' }, band: 'prediction', inverse: '0.212, 0.478', replicates: 3, lod: true, derived: 'sensitivity = b' });
  link(b, imp, fit, 'in');
  const pl = add(b, 'plot1d', 'cal-plot', 1300, 0, {
    ...plot(
      {
        label: 'standards',
        style: curve(0, { mode: 'scatter', symbol: 'circle', symbolSize: 3.5 }),
        cols: { x: 'c (mg/L)', y: 'A', yerr: '±A' },
        rows: [{ label: 'fit, 95 % prediction band', style: lineK(1), cols: { x: 'c (mg/L) (2)', y: 'fit of A', yerr: 'prediction band' } }],
      },
      { legend: { x: 4, y: 4, anchor: 'tl' }, page: { name: 'calibration' } },
    ),
  });
  link(b, imp, pl, 'dataset');
  link(b, fit, pl, 'dataset', 'fit');
  const wb = add(b, 'book', 'cal-use', 1300, 900, { ...WORKBOOK_DEFAULTS, name: 'unknowns', sheets: [], into: ['use of the fit'] });
  link(b, fit, wb, 'in-0', 'use');
  add(b, 'note', 'cal-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'A calibration (example values): the absorbance of eight standards with its error (±A).\n\nFit ▸ Linear, weighted by 1/σ²; Use the fit:\n• X from Y — the concentrations of two unknowns (A = 0.212 and 0.478, each the mean of 3 measurements) with their 95 % intervals;\n• the limits of detection and quantification (3.3·s / slope, 10·s / slope);\n• a derived value: the sensitivity, with its error.\nThe results go to a Workbook (the “use of the fit” output); the Plot draws the standards, the line and its prediction band.',
  });
  return project(b, 'Calibration: unknowns, LOD and LOQ');
}

// a reaction A → B → C (the intermediate B measured) and a fluorescence decay measured through the instrument
function kineticsExample(): Project {
  const b = builder();
  const r = rng(8);
  const [k1, k2, A0] = [0.7, 0.2, 2];
  const kin = ['Time (s);B (mM)'];
  for (let i = 0; i <= 60; i++) {
    const t = i * 0.4;
    kin.push(t.toFixed(1) + ';' + (((A0 * k1) / (k2 - k1)) * (Math.exp(-k1 * t) - Math.exp(-k2 * t)) + 0.01 * gauss(r)).toFixed(4));
  }
  const imp = add(b, 'import', 'kin-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'intermediate', fileName: 'kinetics.txt', text: kin.join('\n'), textId: 'kin-1' });
  const fit = add(b, 'fit', 'kin-fit', 640, 0, { ...FIT_DEFAULTS, model: { ...FIT_DEFAULTS.model, kind: 'ode', ode: 'dA/dt = -k1*A; dB/dt = k1*A - k2*B; A(0) = A0; B(0) = 0; y = B' }, params: [spec('k1', 1), spec('k2', 0.1)] });
  link(b, imp, fit, 'in');
  const p1 = add(b, 'plot1d', 'kin-plot', 1300, 0, {
    ...plot(
      { label: 'B measured', style: dots(0, 3), cols: { x: 'Time (s)', y: 'B (mM)' }, rows: [{ label: 'the rate equations fitted', style: lineK(1), cols: { x: 'Time (s) (2)', y: 'fit of B (mM)', yerr: 'confidence band' } }] },
      { legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'kinetics' } },
    ),
  });
  link(b, imp, p1, 'dataset');
  link(b, fit, p1, 'dataset', 'fit');
  // the decay: a Gaussian response of the instrument (0.12 ns) convolved with exp(−t/2.4 ns), counts with Poisson noise
  const s = 0.12;
  const tau = 2.4;
  const tc = ['Time (ns);Counts;IRF'];
  for (let i = 0; i < 500; i++) {
    const t = i * 0.04;
    const m = 5 + (5000 / 2) * Math.exp((s * s) / (2 * tau * tau) - (t - 2) / tau) * erfcEx(((s * s) / tau - (t - 2)) / (s * Math.SQRT2));
    const irf = 1000 * Math.exp(-((t - 2) ** 2) / (2 * s * s));
    tc.push(t.toFixed(2) + ';' + Math.max(1, Math.round(m + Math.sqrt(m) * gauss(r))) + ';' + irf.toFixed(2));
  }
  const imp2 = add(b, 'import', 'tc-file', 0, 1000, { ...IMPORT_DEFAULTS, name: 'decay', fileName: 'tcspc.txt', text: tc.join('\n'), textId: 'tc-1' });
  const fit2 = add(b, 'fit', 'tc-fit', 640, 1000, { ...FIT_DEFAULTS, ys: ['Counts'], weight: 'statistical', model: { ...FIT_DEFAULTS.model, kind: 'library', model: 'expdec1' }, reconv: true, irfColumn: 'IRF', params: [spec('y0', 0, true), spec('A', 3000), spec('t', 1), spec('shift', 0)], band: 'none' });
  link(b, imp2, fit2, 'in');
  const p2 = add(b, 'plot1d', 'tc-plot', 1300, 1000, {
    ...plot(
      {
        label: 'counts',
        style: dots(7, 1.6),
        cols: { x: 'Time (ns)', y: 'Counts' },
        rows: [
          { label: 'instrument response', style: lineK(2, { dash: 'dash' }), cols: { x: 'Time (ns)', y: 'IRF' } },
          { label: 'IRF ⊗ exponential, fitted', style: lineK(1), cols: { x: 'Time (ns) (2)', y: 'fit of Counts' } },
        ],
      },
      { axes: { y: { ...AXES_STYLE_DEFAULTS.y, scale: 'log' } }, legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'lifetime' } },
    ),
  });
  link(b, imp2, p2, 'dataset');
  link(b, fit2, p2, 'dataset', 'fit');
  add(b, 'note', 'kin-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'Two fits beyond a formula (example values).\n\n1. A → B → C: Fit ▸ Equations — dA/dt = −k1·A; dB/dt = k1·A − k2·B; A(0) = A0; B(0) = 0; y = B — solved numerically at every step of the fit: k1, k2 and A0 found from B alone.\n\n2. A fluorescence decay counted through a slow instrument: Fit ▸ Exponential decay with “Reconvolution” on — the model convolved with the measured response (the IRF column), its shift and a background fitted, the offset of the model fixed at 0, statistical weights (counts). The lifetime t is the one of the sample, not of the instrument.',
  });
  return project(b, 'Kinetics and lifetimes: rate equations, reconvolution');
}
const erfcEx = (x: number) => {
  // erfc by its continued fraction / series (good to 1e-7 here)
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const y = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? y : 2 - y;
};

// ---- Equivalent circuit (EIS): a cell R₀ + R_ct ∥ CPE + W measured from 100 kHz to 10 mHz (0.4 % noise), its
// columns named as a potentiostat writes them, two points spoiled (left out in the node) ----
export const EIS_TRUTH = { R1: 15, R2: 220, 'Q1 Y0': 3e-5, 'Q1 n': 0.87, 'W1 Y0': 4e-3 };
export const EIS_SPOILED = [10, 40];
function eisRows(): string[] {
  const r = rng(29);
  const rows = ["Freq / Hz;Z' / ohm;-Z'' / ohm;Time / s"];
  const T = EIS_TRUTH;
  for (let k = 0; k <= 70; k++) {
    const f = 10 ** (5 - (7 * k) / 70);
    const w = 2 * Math.PI * f;
    // Z = R1 + 1/(1/R2 + Y0 (jω)^n) + 1/(Yw √(jω))
    const [qn, qa] = [T['Q1 Y0'] * w ** T['Q1 n'], (T['Q1 n'] * Math.PI) / 2];
    const [yr, yi] = [1 / T.R2 + qn * Math.cos(qa), qn * Math.sin(qa)];
    const yd = yr * yr + yi * yi;
    const wm = 1 / (T['W1 Y0'] * Math.sqrt(w));
    let re = T.R1 + yr / yd + wm * Math.SQRT1_2;
    let im = -yi / yd - wm * Math.SQRT1_2;
    re *= 1 + 0.004 * gauss(r);
    im *= 1 + 0.004 * gauss(r);
    if (k === EIS_SPOILED[0]) [re, im] = [re * 1.4, im * 0.5];
    if (k === EIS_SPOILED[1]) re *= 0.7;
    rows.push(`${f.toPrecision(6)};${re.toFixed(4)};${(-im).toFixed(4)};${(k * 3).toFixed(0)}`);
  }
  return rows;
}
// A reflectance as measured at normal incidence: a solid of one Lorentz oscillator (E₀ = 3 eV, γ = 0.3 eV, strength 2,
// ε∞ = 1), from 0.5 to 12 eV; its n and k are known, so those Kramers–Kronig gives back can be checked
export const KK_OSC = { e0: 3, gamma: 0.3, s: 2 };
export function oscillatorNK(E: number): [number, number] {
  const { e0, gamma, s } = KK_OSC;
  const dr = e0 * e0 - E * E;
  const di = -gamma * E;
  const den = dr * dr + di * di;
  const [e1, e2] = [1 + (s * e0 * e0 * dr) / den, (-s * e0 * e0 * di) / den];
  const m = Math.hypot(e1, e2);
  return [Math.sqrt((m + e1) / 2), Math.sqrt((m - e1) / 2)];
}
// the oscillator's ε₁, ε₂ at E
export function oscillatorEps(E: number): [number, number] {
  const [n, k] = oscillatorNK(E);
  return [n * n - k * k, 2 * n * k];
}
// a file of the oscillator from 0.2 to 20 eV: its reflectance (%) and its true n, k; or its ε₂ and its true ε₁
function oscillatorRows(what: 'reflectance' | 'epsilon'): string[] {
  const rows = [what === 'reflectance' ? 'Energy (eV);R (%);n (true);k (true)' : 'Energy (eV);ε₂;ε₁ (true)'];
  for (let k = 0; k <= 396; k++) {
    const E = 0.2 + 0.05 * k;
    const [n, kk] = oscillatorNK(E);
    const [e1, e2] = oscillatorEps(E);
    if (what === 'reflectance') rows.push(`${E.toFixed(2)};${((100 * ((n - 1) ** 2 + kk * kk)) / ((n + 1) ** 2 + kk * kk)).toFixed(4)};${n.toFixed(5)};${kk.toFixed(5)}`);
    else rows.push(`${E.toFixed(2)};${e2.toFixed(5)};${e1.toFixed(5)}`);
  }
  return rows;
}
// An impedance spectrum (R_s = 15 Ω, R_ct = 220 Ω, C_dl = 20 µF; 0.15 % noise), 10 points a decade from 100 kHz to
// 0.1 Hz; drifted: R_ct grew by 30 % while it was measured (the low frequencies, measured last, see a larger one)
export function kkCellRows(drifted: boolean): string[] {
  const r = rng(drifted ? 64 : 63);
  const rows = ["Freq (Hz);Z' (ohm);-Z'' (ohm)"];
  for (let i = 0; i <= 60; i++) {
    const f = 10 ** (5 - i / 10);
    const w = 2 * Math.PI * f;
    const Rct = 220 * (drifted ? 1 + (0.3 * i) / 60 : 1);
    const d = 1 + (w * Rct * 2e-5) ** 2;
    const [re, im] = [15 + Rct / d, (-w * Rct * Rct * 2e-5) / d];
    const m = Math.hypot(re, im);
    rows.push(`${f.toPrecision(6)};${(re + 0.0015 * m * gauss(r)).toFixed(4)};${(-(im + 0.0015 * m * gauss(r))).toFixed(4)}`);
  }
  return rows;
}
// Lin-KK on two spectra of one cell: as measured, and with the cell changing during the sweep
function kkImpedanceExample(): Project {
  const b = builder();
  const good = add(b, 'import', 'kk-good-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'stable cell', fileName: 'cell_stable.txt', text: kkCellRows(false).join('\n'), textId: 'kk-good' });
  const bad = add(b, 'import', 'kk-bad-data', 0, 800, { ...IMPORT_DEFAULTS, name: 'drifting cell', fileName: 'cell_drifting.txt', text: kkCellRows(true).join('\n'), textId: 'kk-bad' });
  const t1 = add(b, 'kk', 'kk-good', 640, 0, { ...KK_DEFAULTS, mode: 'eis' });
  const t2 = add(b, 'kk', 'kk-bad', 640, 800, { ...KK_DEFAULTS, mode: 'eis' });
  link(b, good, t1, 'in');
  link(b, bad, t2, 'in');
  const p = add(
    b,
    'plot1d',
    'kk-res',
    1300,
    300,
    plot(
      { label: 'stable cell', style: curve(0, { mode: 'linesymbol', symbol: 'circle', symbolSize: 3 }), cols: { x: 'Frequency (Hz)', y: 'Residual Z′ (%)' }, rows: [{ label: 'drifting cell', style: curve(3, { mode: 'linesymbol', symbol: 'square', symbolSize: 3 }), cols: { x: 'Frequency (Hz)', y: 'Residual Z′ (%)' } }] },
      { axes: { x: { ...AXES_STYLE_DEFAULTS.x, scale: 'log' }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Frequency (Hz)' }), left: side({ title: 'Residual of Z′ (% of |Z|)' }) } }, legend: { x: 4, y: 4, anchor: 'tl' }, page: { name: 'lin_kk_residuals' } },
    ),
  );
  link(b, t1, p, 'dataset');
  link(b, t2, p, 'series-1');
  add(b, 'note', 'kk-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'Kramers–Kronig, impedance: is a measured spectrum trustworthy?\n\nThe real and imaginary parts of the impedance of a stable, linear, causal system are tied together (Kramers–Kronig). The Lin-KK test checks that without knowing the circuit: it fits the spectrum with many RC elements spread over the frequencies measured, then looks at what is left (the residuals, in % of |Z|).\n\nAbove: a cell measured as it should be (0.15 % noise). Its residuals stay within the green band (±1 %): the data obey Kramers–Kronig, an equivalent circuit can be fitted to them.\n\nBelow: the same cell, but its charge-transfer resistance grew by 30 % during the sweep (the low frequencies, measured last, see a larger one). Its residuals leave the band with a trend: the spectrum is not consistent, and a circuit fitted to it would mislead.\n\nThe Plot puts the residuals of Z′ of both together.',
  });
  return project(b, 'Kramers–Kronig (impedance): a stable cell passes, a drifting one fails');
}
// n and k from a reflectance alone, against the true ones
function kkOpticalExample(): Project {
  const b = builder();
  const rf = add(b, 'import', 'kk-refl', 0, 0, { ...IMPORT_DEFAULTS, name: 'Reflectance', fileName: 'reflectance.txt', text: oscillatorRows('reflectance').join('\n'), textId: 'kk-refl' });
  const opt = add(b, 'kk', 'kk-optical', 640, 0, { ...KK_DEFAULTS, mode: 'optical', a: 'R (%)', low: 'constant', high: 'power', power: 4 });
  link(b, rf, opt, 'in');
  const p = add(
    b,
    'plot1d',
    'kk-nk',
    1300,
    0,
    plot(
      {
        label: 'n from R (KK)',
        style: lineK(3, { lineWidth: 1.6 }),
        cols: { x: 'Energy (eV)', y: 'n' },
        rows: [
          { label: 'k from R (KK)', style: lineK(0, { lineWidth: 1.6 }), cols: { x: 'Energy (eV)', y: 'k' } },
          { label: 'n (true)', style: lineK(3, { dash: 'dash', lineWidth: 0.9 }), cols: { x: 'Energy (eV)', y: 'n (true)' } },
          { label: 'k (true)', style: lineK(0, { dash: 'dash', lineWidth: 0.9 }), cols: { x: 'Energy (eV)', y: 'k (true)' } },
        ],
      },
      { axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Energy (eV)' }), left: side({ title: 'n, k' }) } }, legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'n_k' } },
    ),
  );
  link(b, opt, p, 'dataset');
  link(b, rf, p, 'series-2');
  link(b, rf, p, 'series-3');
  add(b, 'note', 'kk-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'Kramers–Kronig, optical: n and k from the reflectance alone.\n\nA reflectance measured at normal incidence (in %; X in eV, as written in its column) gives only |r|. Kramers–Kronig gives the phase of r from it, and with |r| and its phase, the complex index n + ik (and ε₁, ε₂, α).\n\nThe integral runs over all energies, so R is carried past the range measured: constant below 0.2 eV, falling as E⁻⁴ above 20 eV. These tails are assumptions: on the graph of the node (Graph of: R and its tails) they are dashed, past the dashed lines where the data end.\n\nThe file was made from a known solid (one Lorentz oscillator at 3 eV), so its true n and k are in it too: the Plot shows the n and k found (solid) over the true ones (dashed). They agree within a few hundredths; nearest the ends, where the tails matter most, the least.',
  });
  return project(b, 'Kramers–Kronig (optical): n and k from a reflectance');
}
// ε₁ from ε₂, against the true one
function kkGeneralExample(): Project {
  const b = builder();
  const ef = add(b, 'import', 'kk-eps', 0, 0, { ...IMPORT_DEFAULTS, name: 'ε₂', fileName: 'epsilon2.txt', text: oscillatorRows('epsilon').join('\n'), textId: 'kk-eps' });
  const g = add(b, 'kk', 'kk-general', 640, 0, { ...KK_DEFAULTS, mode: 'general', a: 'ε₂', direction: 'im2re', offset: 1, low: 'zero', high: 'power', power: 3 });
  link(b, ef, g, 'in');
  const p = add(
    b,
    'plot1d',
    'kk-e1',
    1300,
    0,
    plot(
      {
        label: 'ε₁ from ε₂ (KK)',
        style: lineK(3, { lineWidth: 1.6 }),
        cols: { x: 'Energy (eV)', y: 'Re by KK (from ε₂)' },
        rows: [
          { label: 'ε₁ (true)', style: lineK(3, { dash: 'dash', lineWidth: 0.9 }), cols: { x: 'Energy (eV)', y: 'ε₁ (true)' } },
          { label: 'ε₂ (given)', style: lineK(0, { lineWidth: 1.2 }), cols: { x: 'Energy (eV)', y: 'ε₂' } },
        ],
      },
      { axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Energy (eV)' }), left: side({ title: 'ε₁, ε₂' }) } }, legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'epsilon' } },
    ),
  );
  link(b, g, p, 'dataset');
  link(b, ef, p, 'series-1');
  link(b, ef, p, 'series-2');
  add(b, 'note', 'kk-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'Kramers–Kronig, general: the real part of a response from its imaginary part.\n\nε₂ (the absorption) of a solid is given; Kramers–Kronig gives ε₁ from it: ε₁(E) = ε∞ + (2/π) P∫ E′ ε₂(E′) / (E′² − E²) dE′. Here ε∞ = 1 (Re at ∞ in the node), ε₂ taken as zero below the data and falling as E⁻³ above them (dashed on the node’s graph).\n\nThe same works for χ′ from χ″, or the other way (Use: general, Find: Im from Re).\n\nThe file holds the true ε₁ as well: the Plot shows the ε₁ found (solid) over the true one (dashed).',
  });
  return project(b, 'Kramers–Kronig (general): ε₁ from ε₂');
}
function eisExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'eis-data', 0, 0, { ...IMPORT_DEFAULTS, name: 'EIS cell', fileName: 'cell_eis.txt', text: eisRows().join('\n'), textId: 'eis-cell' });
  const fit = add(b, 'eis', 'eis-node', 640, 0, { ...EIS_DEFAULTS, circuit: 'R(RQ)W', excluded: EIS_SPOILED });
  link(b, imp, fit, 'in');
  const cv = add(b, 'canvas', 'eis-canvas', 1300, 0, { ...CANVAS_DEFAULTS, width: 180, height: 75, name: 'eis_nyquist_bode', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 2, hgap: 4 } });
  // (Nyquist and Bode: Plots of the node's data and of its smooth fit)
  for (const [g, pid, y] of [['figure', 'eis-nyquist', 0], ['bode', 'eis-bode', 480]] as const) {
    add(b, 'plot1d', pid, 1300, 300 + y, eisPlotData(g).data);
    b.edges.push(...eisPlotEdges(fit, pid, g));
    link(b, pid, cv, 'figures', 'figure');
  }
  add(b, 'note', 'eis-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'An impedance spectrum (simulated: R₀ = 15 Ω, R_ct = 220 Ω, a CPE Y0 = 3·10⁻⁵ S·sⁿ, n = 0.87, a Warburg Y0 = 4·10⁻³ S·s^½; 0.4 % noise) with its columns named as a potentiostat writes them — Freq / Hz, Z\' / ohm, -Z\'\' / ohm and a Time column.\n\nEquivalent circuit: the columns chosen by their role (guessed from the names, shown in Columns), the circuit R(RQ)W (Boukamp’s code, its schematic drawn), the starts guessed from the data, the fit on Z′ and Z″ at once; two spoiled points (at 10 kHz and 10 Hz) left out with a click — grey crosses on the graph.',
  });
  return project(b, 'Equivalent circuit (EIS): R(RQ)W fitted, two points left out');
}

// the impedance of a cell: R0 in series with R1 ∥ a constant-phase element, measured from 0.1 Hz to 100 kHz
function impedanceExample(): Project {
  const b = builder();
  const r = rng(13);
  const rows = ['ω (rad/s);Re Z (Ω);−Im Z (Ω)'];
  for (let k = 0; k <= 60; k++) {
    const w = 2 * Math.PI * 10 ** (-1 + (6 * k) / 60);
    // R0 + R1/(1 + R1·Q·(jω)^n)
    const [R0, R1, Q, n] = [12, 150, 2e-5, 0.85];
    const ph = (n * Math.PI) / 2;
    const m = R1 * Q * w ** n;
    const [dr, di] = [1 + m * Math.cos(ph), m * Math.sin(ph)];
    const d = dr * dr + di * di;
    const re = R0 + (R1 * dr) / d;
    const im = (-R1 * di) / d;
    rows.push(w.toPrecision(6) + ';' + (re * (1 + 0.005 * gauss(r))).toFixed(3) + ';' + (-im * (1 + 0.005 * gauss(r))).toFixed(3));
  }
  const imp = add(b, 'import', 'eis-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'EIS', fileName: 'eis.txt', text: rows.join('\n'), textId: 'eis-1' });
  const fit = add(b, 'fit', 'eis-fit', 640, 0, {
    ...FIT_DEFAULTS,
    x: 'ω (rad/s)',
    ys: ['Re Z (Ω)', '−Im Z (Ω)'],
    model: { ...FIT_DEFAULTS.model, kind: 'complex', cformula: 'cpe(w, Q, n) = 1/(Q*(j*w)^n); par(a, b) = a*b/(a + b); conj(R0 + par(R1, cpe(x, Q, n)))' },
    params: [spec('R0', 10), spec('R1', 100), spec('Q', 1e-5), spec('n', 0.9)],
    band: 'none',
  });
  link(b, imp, fit, 'in');
  const ny = add(b, 'plot1d', 'eis-nyquist', 1300, 0, {
    ...plot(
      { label: 'measured', style: dots(0, 3), cols: { x: 'Re Z (Ω)', y: '−Im Z (Ω)' }, rows: [{ label: 'R0 + R1 ∥ CPE, fitted', style: lineK(1), cols: { x: 'fit (Re Z (Ω))', y: 'fit (−Im Z (Ω))' } }] },
      { axes: { aspect: 1 }, legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'nyquist' } },
    ),
  });
  link(b, imp, ny, 'dataset');
  link(b, fit, ny, 'dataset', 'fit');
  add(b, 'note', 'eis-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'Electrochemical impedance (example values): Re Z and −Im Z from 0.1 Hz to 100 kHz.\n\nFit ▸ Complex: one formula in complex numbers of x = ω (j the imaginary unit), with functions of your own before it — cpe(w, Q, n) = 1/(Q·(jω)^n); par(a, b) = a·b/(a + b); conj(R0 + par(R1, cpe(x, Q, n))) — fitted to both parts at once (Y 1 the real part, Y 2 the imaginary part: −Im Z, hence the conj).\n\nThe Nyquist plot: −Im Z against Re Z with Axes ▸ Aspect = 1 (an ohm as long on both axes), the fit drawn from its two curves.',
  });
  return project(b, 'Impedance: an equivalent circuit fitted, a Nyquist plot');
}

// a sampled signal: two tones and noise; its PSD, a Butterworth low pass, the Allan deviation of a drifting sensor
function signalsFile(): string {
  const r = rng(17);
  const lines = ['Time (s);Signal (V);Sensor (mV)'];
  let drift = 0;
  for (let i = 0; i < 2000; i++) {
    const t = i / 200;
    drift += 0.02 * gauss(r);
    lines.push(t.toFixed(3) + ';' + (Math.sin(2 * Math.PI * 7 * t) + 0.5 * Math.sin(2 * Math.PI * 43 * t + 0.4) + 0.4 * gauss(r)).toFixed(5) + ';' + (100 + gauss(r) + drift).toFixed(4));
  }
  return lines.join('\n');
}
function spectralExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'sp-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'signals', fileName: 'signals.txt', text: signalsFile(), textId: 'sp-1' });
  const psd = add(b, 'fft', 'sp-psd', 640, 0, { ...FFT_DEFAULTS, ys: 'Signal (V)', mode: 'psd', seg: 256, psdDb: true });
  link(b, imp, psd, 'in');
  const lp = add(b, 'fft', 'sp-lp', 640, 800, { ...FFT_DEFAULTS, ys: 'Signal (V)', mode: 'filter', design: 'butter', order: 4, f1: 15 });
  link(b, imp, lp, 'in');
  const al = add(b, 'fft', 'sp-allan', 640, 1600, { ...FFT_DEFAULTS, ys: 'Sensor (mV)', mode: 'allan', allanSpacing: 'octave' });
  link(b, imp, al, 'in');
  const p1 = add(b, 'plot1d', 'sp-plot-psd', 1300, 0, plot({ label: 'PSD (Welch, 256 points, Hann)', style: lineK(0), cols: { x: 'Frequency (1/s)', y: 'Signal (V) PSD (dB)' } }, { page: { name: 'psd' } }));
  link(b, psd, p1, 'dataset');
  const p2 = add(b, 'plot1d', 'sp-plot-lp', 1300, 800, {
    ...plot(
      { label: 'signal', style: lineK(7, { lineWidth: 0.6 }), cols: { x: 'Time (s)', y: 'Signal (V)' }, rows: [{ label: 'Butterworth low pass, 15 Hz, order 4, zero phase', style: lineK(1), cols: { x: 'Time (s)', y: 'Signal (V) (filtered)' } }] },
      { axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 0, max: 1.5 } }, legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'low_pass' } },
    ),
  });
  link(b, imp, p2, 'dataset');
  link(b, lp, p2, 'dataset');
  const p3 = add(b, 'plot1d', 'sp-plot-allan', 1300, 1600, {
    ...plot({ label: 'Allan deviation', style: curve(2, { mode: 'linesymbol', symbol: 'circle', symbolSize: 3 }), cols: { x: 'τ (s)', y: 'Allan deviation (Sensor (mV))' } }, { axes: { x: { ...AXES_STYLE_DEFAULTS.x, scale: 'log' }, y: { ...AXES_STYLE_DEFAULTS.y, scale: 'log' } }, page: { name: 'allan' } }),
  });
  link(b, al, p3, 'dataset');
  add(b, 'note', 'sp-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'Signals sampled at 200 Hz (example values): two tones (7 and 43 Hz) in noise, and a sensor that drifts slowly.\n\nFFT node, three modes:\n• power spectral density (Welch: segments of 256 points, half overlapping, Hann, in dB) — the two lines above the noise floor;\n• filter ▸ Butterworth (IIR), low pass at 15 Hz, order 4, forward and backward (no phase shift);\n• Allan deviation of the sensor against the averaging time τ: falling as τ^−½ while the noise dominates, rising when the drift takes over — the best averaging time at its minimum.',
  });
  return project(b, 'Signals: PSD, a Butterworth filter, the Allan deviation');
}

// a study of 60 samples: a response explained by three measures, a yes / no outcome, their principal components
function studyFile(): string {
  const r = rng(29);
  const lines = ['x1;x2;x3;y;outcome;batch'];
  for (let i = 0; i < 60; i++) {
    const x1 = 5 + 2 * gauss(r);
    const x2 = 0.6 * x1 + 1.5 * gauss(r);
    const x3 = 10 * r();
    const y = 2 + 1.5 * x1 - 0.8 * x2 + 0.3 * x3 + 1.2 * gauss(r);
    const p = 1 / (1 + Math.exp(-(-3 + 0.7 * x1 - 0.25 * x3)));
    lines.push([x1, x2, x3, y].map((v) => v.toFixed(3)).join(';') + ';' + (r() < p ? 'yes' : 'no') + ';' + (i < 30 ? 'A' : 'B'));
  }
  return lines.join('\n');
}
function regressionExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'st-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'study', fileName: 'study.txt', text: studyFile(), textId: 'st-1', edits: { cols: { 0: { role: 'none' }, 1: { role: 'none' }, 2: { role: 'none' }, 3: { role: 'none' } } } });
  const lin = add(b, 'fit', 'st-linear', 640, 0, { ...FIT_DEFAULTS, regression: 'linear', ys: ['y'], predictors: 'x1, x2, x3' });
  link(b, imp, lin, 'in');
  const lg = add(b, 'fit', 'st-logistic', 640, 800, { ...FIT_DEFAULTS, regression: 'logistic', ys: ['outcome'], predictors: 'x1, x3' });
  link(b, imp, lg, 'in');
  const co = add(b, 'correl', 'st-corr', 640, 1600, { ...CORR_DEFAULTS, cols: 'x1, x2, x3, y', pca: true, order: 'cluster' });
  link(b, imp, co, 'in');
  const tt = add(b, 'ttest', 'st-ttest', 640, 2300, { ...TTEST_DEFAULTS, layout: 'indexed', value: 'y', factor: 'batch', power: true });
  link(b, imp, tt, 'in');
  const sc = add(b, 'stats', 'st-control', 640, 3000, { ...STATS_DEFAULTS, cols: 'y', control: 'imr' });
  link(b, imp, sc, 'in');
  const p1 = add(b, 'plot1d', 'st-plot-fit', 1300, 0, plot({ label: 'observed against fitted', style: dots(0, 3), cols: { x: 'fitted y', y: 'y' } }, { page: { name: 'regression' } }));
  link(b, lin, p1, 'dataset', 'fit');
  const p2 = add(b, 'plot1d', 'st-plot-scores', 1300, 1600, plot({ label: 'scores', style: dots(2, 3), cols: { x: 'PC1', y: 'PC2' } }, { page: { name: 'pca_scores' } }));
  link(b, co, p2, 'dataset', 'scores');
  const p3 = add(b, 'plot1d', 'st-plot-control', 1300, 3000, {
    ...plot(
      {
        label: 'y',
        style: curve(0, { mode: 'linesymbol', symbol: 'circle', symbolSize: 2.5 }),
        cols: { x: 'point', y: 'y' },
        rows: [
          { label: 'CL', style: lineK(7), cols: { x: 'point', y: 'CL' } },
          { label: 'UCL', style: lineK(3, { dash: 'dash' }), cols: { x: 'point', y: 'UCL' } },
          { label: 'LCL', style: lineK(3, { dash: 'dash' }), cols: { x: 'point', y: 'LCL' } },
        ],
      },
      { page: { name: 'control_chart' } },
    ),
  });
  link(b, sc, p3, 'dataset', 'control');
  add(b, 'note', 'st-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'A study of 60 samples (example values).\n\n• Fit ▸ linear regression of y on x1, x2, x3: the coefficients ± SE, t, p, CI and the variance inflation (x1 and x2 are related); R², F, AIC.\n• Fit ▸ logistic regression of the yes / no outcome on x1 and x3: the odds ratios, McFadden’s R², the LR test.\n• Correlation with the matrix in clustered order and the principal components (their scores drawn).\n• t-test of y between the batches with its power and the size needed for 80 %.\n• Descriptive statistics ▸ control chart of y (individuals and moving ranges).',
  });
  return project(b, 'Regression, PCA, power and a control chart');
}

// ---- Data preparation ----

// a side of the axes in a colour (its line, numbers and title), shown with its numbers and title (a right axis)
const sideIn = (c: string, title: string) => side({ color: c, labelText: { color: c }, titleText: { color: c }, title, labels: true, showTitle: true });
const ownRight = { mode: 'own' as const, scale: AXES_STYLE_DEFAULTS.y, fn: '' };

// A temperature and humidity logger's file as it comes: three values missing, three spikes, three times written twice,
// a block of rows written late (out of order), a column not needed (the battery); a door opened at 45 min (two humidity
// readings to leave out by hand).
function loggerFile(): string {
  const r = rng(31);
  const rowOf = (t: number, again = false) => {
    const T = 21 + 3 * (1 - Math.exp(-t / 25)) + 0.6 * Math.sin((2 * Math.PI * t) / 60) + 0.08 * gauss(r) + (t === 34 ? 9 : t === 79 ? -7 : t === 102 ? 11 : 0);
    const H = t === 45 ? 31.2 : t === 46 ? 29.5 : 45 - 6 * (1 - Math.exp(-t / 30)) + 0.3 * gauss(r);
    const missing = [17, 63, 97].includes(t) && !again;
    return `${t},${missing ? '' : (T + (again ? 0.02 : 0)).toFixed(2)},${H.toFixed(1)},${(3.3 - 0.0004 * t).toFixed(3)}`;
  };
  const order = [...Array.from({ length: 70 }, (_, t) => t), ...Array.from({ length: 11 }, (_, k) => 80 + k), ...Array.from({ length: 10 }, (_, k) => 70 + k), ...Array.from({ length: 30 }, (_, k) => 91 + k)];
  const lines = ['Time (min),Temperature (°C),Humidity (%),Battery (V)'];
  for (const t of order) {
    lines.push(rowOf(t));
    if ([10, 55, 88].includes(t)) lines.push(rowOf(t, true));
  }
  return lines.join('\n');
}

function loggerExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'lg-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'logger', fileName: 'logger.csv', text: loggerFile(), textId: 'lg-1' });
  // the battery left out, the rest as it is
  const cols = add(b, 'columns', 'lg-cols', 640, 0, { ...COLUMNS_DEFAULTS, items: [{ from: 'Time (min)', role: 'x' }, { from: 'Temperature (°C)', role: 'y' }, { from: 'Humidity (%)', role: 'y' }, { from: 'Battery (V)', keep: false }] });
  link(b, imp, cols, 'in');
  // in the order of time, the times written twice merged
  const filt = add(b, 'filterrows', 'lg-filter', 1100, 0, { ...FILTER_DEFAULTS, dup: 'mean', sortBy: 'Time (min)' });
  link(b, cols, filt, 'in');
  // the missing temperatures filled, the spikes found against the moving median and replaced
  const clean = add(b, 'clean', 'lg-clean', 1560, 0, { ...CLEAN_DEFAULTS, cols: 'Temperature (°C)', missing: 'linear', outliers: 'movmedian', window: 7, k: 5, action: 'linear' });
  link(b, filt, clean, 'in');
  // the two humidity readings of the open door masked by hand (rows 46, 47 of the 121)
  const manip = add(b, 'datamanip', 'lg-manip', 2020, 0, { ...DATAMANIP_DEFAULTS, x: 'Time (min)', y: 'Humidity (%)', ops: [{ kind: 'mask', rows: '46-47', n: 121 }] });
  link(b, clean, manip, 'in');
  const changes = add(b, 'book', 'lg-changes', 1560, 760, { ...WORKBOOK_DEFAULTS, name: 'changes', sheets: [], into: ['changes'] });
  link(b, clean, changes, 'in-0', 'changes');
  const p = add(
    b,
    'plot1d',
    'lg-plot',
    2560,
    0,
    plot(
      {
        // the file's values behind (its own data port), the cleaned ones over them
        label: 'temperature, as logged',
        style: curve(7, { mode: 'scatter', symbol: 'circle', symbolSize: 2.5, color: '#a0a0a0' }),
        cols: { x: 'Time (min)', y: 'Temperature (°C)' },
        rows: [
          { label: 'temperature, cleaned', style: lineK(2), cols: { x: 'Time (min)', y: 'Temperature (°C)' } },
          { label: 'humidity (2 points masked)', style: curve(1, { mode: 'linesymbol', symbol: 'square', symbolSize: 2.5, lineWidth: 0.8, axisY: 'right' }), cols: { x: 'Time (min)', y: 'Humidity (%)' } },
        ],
      },
      {
        axes: {
          x: { ...AXES_STYLE_DEFAULTS.x, min: 0, max: 120 },
          right: ownRight,
          sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Time (min)' }), left: sideIn(PALETTE[2], 'Temperature (°C)'), right: sideIn(PALETTE[1], 'Humidity (%)'), top: side({ labels: false, showTitle: false }) },
        },
        legend: { x: 50, y: 4, anchor: 'tc' },
        page: { name: 'logger_cleaned' },
      },
    ),
  );
  link(b, imp, p, 'series');
  link(b, manip, p, 'dataset');
  return project(b, 'Cleaning a sensor log: order, repeats, gaps, spikes');
}

// Three scans of one absorption band, each on its own wavelength grid (another step, another start), with noise and a
// small drift of the height.
function scanFile(k: number): string {
  const r = rng(41 + k);
  const G = (x: number, c: number, w: number) => Math.exp((-4 * Math.LN2 * (x - c) ** 2) / (w * w));
  const [start, step, gain] = [
    [400, 2, 1],
    [401, 2.5, 0.96],
    [400, 3, 1.05],
  ][k];
  const lines = ['Wavelength (nm);Absorbance'];
  for (let x = start; x <= 700 + 1e-9; x += step) lines.push(`${+x.toFixed(2)};${(gain * (0.05 + 0.8 * G(x, 520, 70) + 0.25 * G(x, 610, 40)) + 0.012 * gauss(r)).toFixed(4)}`);
  return lines.join('\n');
}

function scansExample(): Project {
  const b = builder();
  const imps = [0, 1, 2].map((k) => add(b, 'import', `sc-file${k + 1}`, 0, k * 560, { ...IMPORT_DEFAULTS, name: `scan ${k + 1}`, fileName: `scan${k + 1}.txt`, text: scanFile(k), textId: `sc-${k + 1}` }));
  // the mean ± SD on a common grid of 2 nm
  const avg = add(b, 'average', 'sc-avg', 700, 0, { ...AVERAGE_DEFAULTS, grid: 'uniform', from: 405, to: 695, points: 146 });
  imps.forEach((id, k) => link(b, id, avg, `in-${k}`));
  // every point of the three scans in one table, in the order of the wavelength
  const all = add(b, 'combine', 'sc-all', 700, 760, { ...COMBINE_DEFAULTS, how: 'sortx', name: 'all scans' });
  imps.forEach((id, k) => link(b, id, all, `in-${k}`));
  const p = add(
    b,
    'plot1d',
    'sc-plot',
    1240,
    0,
    plot(
      {
        // the points behind (their own data port), the mean over them
        label: 'the scans’ points',
        style: curve(7, { mode: 'scatter', symbol: 'circle', symbolSize: 1.8, color: '#a0a0a0' }),
        cols: { x: 'Wavelength (nm)', y: 'Absorbance' },
        rows: [{ label: 'mean ± SD (3 scans)', style: curve(1, { lineWidth: 1.2, errStyle: 'band' }), cols: { x: 'Wavelength (nm)', y: 'mean', yerr: 'SD' } }],
      },
      {
        axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 400, max: 700 }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Wavelength (nm)' }), left: side({ title: 'Absorbance' }) } },
        legend: { x: 96, y: 4, anchor: 'tr' },
        page: { name: 'scans_mean' },
      },
    ),
  );
  link(b, all, p, 'series');
  link(b, avg, p, 'dataset');
  return project(b, 'Replicate scans: mean ± SD on a common X');
}

// A reference and a sample spectrum on different grids; the spectrometer was 2 nm off when the sample was measured, and
// the sample has one band more (655 nm).
function diffFile(sample: boolean): string {
  const r = rng(sample ? 52 : 51);
  const G = (x: number, c: number, w: number) => Math.exp((-4 * Math.LN2 * (x - c) ** 2) / (w * w));
  const base = (x: number) => 0.2 + 0.6 * G(x, 600, 60) + 0.3 * G(x, 720, 40);
  const lines = ['Wavelength (nm);Intensity (a.u.)'];
  if (sample) for (let x = 500.5; x <= 800; x += 1.5) lines.push(`${x};${(base(x - 2) + 0.25 * G(x - 2, 655, 18) + 0.005 * gauss(r)).toFixed(4)}`);
  else for (let x = 500; x <= 800; x += 1) lines.push(`${x};${(base(x) + 0.005 * gauss(r)).toFixed(4)}`);
  return lines.join('\n');
}

function differenceExample(): Project {
  const b = builder();
  const ref = add(b, 'import', 'df-ref', 0, 0, { ...IMPORT_DEFAULTS, name: 'reference', fileName: 'reference.txt', text: diffFile(false), textId: 'df-1' });
  const smp = add(b, 'import', 'df-sample', 0, 560, { ...IMPORT_DEFAULTS, name: 'sample', fileName: 'sample.txt', text: diffFile(true), textId: 'df-2' });
  // the sample's wavelengths corrected: 2 nm back
  const tr = add(b, 'translate', 'df-shift', 680, 560, { ...TRANSLATE_DEFAULTS, mode: 'value', dx: -2, dy: 0 });
  link(b, smp, tr, 'data');
  // A − B and A / B on a common grid of 1 nm (where both curves are)
  const op = (o: 'sub' | 'div') => ({ op: o, values: '', crossing: 'first' as const, abs: false, grid: 'uniform' as const, from: 505, to: 790, points: 286 });
  const cm = add(b, 'curvemath', 'df-math', 1160, 0, { ...CURVEMATH_DEFAULTS, op: 'sub', grid: 'uniform', from: 505, to: 790, points: 286, ops: [op('sub'), op('div')] });
  link(b, tr, cm, 'a');
  link(b, ref, cm, 'b');
  const p = add(
    b,
    'plot1d',
    'df-plot',
    1760,
    0,
    plot(
      {
        label: 'sample (−2 nm)',
        style: lineK(1),
        cols: { x: 'Wavelength (nm)', y: 'Intensity (a.u.)' },
        rows: [
          { label: 'reference', style: lineK(7, { color: '#7f7f7f' }), cols: { x: 'Wavelength (nm)', y: 'Intensity (a.u.)' } },
          { label: 'sample − reference', style: lineK(3, { axisY: 'right' }), cols: { x: 'Wavelength (nm)', y: 'A − B' } },
        ],
      },
      {
        axes: {
          x: { ...AXES_STYLE_DEFAULTS.x, min: 500, max: 800 },
          right: ownRight,
          sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Wavelength (nm)' }), left: side({ title: 'Intensity (a.u.)' }), right: sideIn(PALETTE[3], 'Difference (a.u.)'), top: side({ labels: false, showTitle: false }) },
        },
        legend: { x: 96, y: 4, anchor: 'tr' },
        page: { name: 'difference' },
      },
    ),
  );
  link(b, tr, p, 'series');
  link(b, ref, p, 'series-1');
  link(b, cm, p, 'series-2');
  return project(b, 'Difference spectrum: sample minus reference');
}

// The image of a graph (drawn here from a known curve, as a figure in a paper would be) for the Digitizer: its frame
// from (70, 30) to (570, 340) pixels, X 0 … 10, Y 0 … 2.
const digiCurve = (x: number) => 0.2 + 1.5 * Math.exp(-((x - 3) ** 2) / 2) + 0.4 * Math.exp(-((x - 7) ** 2) / 0.8);
const digiU = (x: number) => 70 + 50 * x;
const digiV = (y: number) => 340 - 155 * y;
function digiImage(): string {
  const ticks = (n: number, f: (k: number) => string) => Array.from({ length: n }, (_, k) => f(k)).join('');
  const path = Array.from({ length: 201 }, (_, k) => `${k ? 'L' : 'M'}${digiU(k / 20).toFixed(1)},${digiV(digiCurve(k / 20)).toFixed(1)}`).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" font-family="Arial" font-size="13">` +
    `<rect width="600" height="400" fill="#ffffff"/>` +
    `<rect x="70" y="30" width="500" height="310" fill="none" stroke="#000" stroke-width="1.2"/>` +
    ticks(6, (k) => `<line x1="${digiU(2 * k)}" y1="340" x2="${digiU(2 * k)}" y2="346" stroke="#000"/><text x="${digiU(2 * k)}" y="362" text-anchor="middle">${2 * k}</text>`) +
    ticks(5, (k) => `<line x1="64" y1="${digiV(k / 2)}" x2="70" y2="${digiV(k / 2)}" stroke="#000"/><text x="58" y="${digiV(k / 2) + 4}" text-anchor="end">${(k / 2).toFixed(1)}</text>`) +
    `<text x="320" y="390" text-anchor="middle">Time (s)</text><text x="18" y="185" text-anchor="middle" transform="rotate(-90 18 185)">Signal (mV)</text>` +
    `<path d="${path}" fill="none" stroke="#1f5fbf" stroke-width="2"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}



function digitizerExample(): Project {
  const b = builder();
  // calibrated on the axes (two ticks on each), the curve's points placed as clicks would (on whole pixels)
  const points = Array.from({ length: 21 }, (_, k) => ({ u: Math.round(digiU(k / 2)), v: Math.round(digiV(digiCurve(k / 2))) }));
  const dg = add(b, 'digitizer', 'dg-image', 0, 0, {
    ...DIGITIZER_DEFAULTS,
    image: digiImage(),
    imageName: 'figure_3b.svg',
    w: 600,
    h: 400,
    axes: [
      { u: 70, v: 340, val: 0 },
      { u: 570, v: 340, val: 10 },
      { u: 70, v: 340, val: 0 },
      { u: 70, v: 30, val: 2 },
    ],
    xName: 'Time (s)',
    yName: 'Signal (mV)',
    sets: [{ name: 'Set 1', color: '#e6194b', points }],
  });
  // the curve the image was drawn from, to compare with
  const x = add(b, 'gencol', 'dg-x', 0, 760, { ...GENCOL_DEFAULTS, name: 'Time (s)', mode: 'linspace', count: 201, start: 0, stop: 10 });
  const y = add(b, 'mathcol', 'dg-true', 420, 760, { ...MATHCOL_DEFAULTS, name: 'Signal (mV)', formula: '0.2 + 1.5*exp(-(A-3)^2/2) + 0.4*exp(-(A-7)^2/0.8)' });
  link(b, x, y, 'in-0');
  const p = add(
    b,
    'plot1d',
    'dg-plot',
    900,
    0,
    plot(
      {
        label: 'read off the image',
        style: curve(3, { mode: 'scatter', symbol: 'circle', symbolFill: 'open', symbolSize: 4.5, symbolEdge: 1 }),
        cols: { x: 'Time (s)', y: 'Signal (mV)' },
        rows: [{ label: 'the curve drawn', style: lineK(1, { lineWidth: 1 }) }],
      },
      {
        axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 0, max: 10 }, y: { ...AXES_STYLE_DEFAULTS.y, min: 0, max: 2 }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Time (s)' }), left: side({ title: 'Signal (mV)' }) } },
        legend: { x: 96, y: 4, anchor: 'tr' },
        page: { name: 'digitized' },
      },
    ),
  );
  link(b, dg, p, 'dataset');
  link(b, x, p, 'x-1');
  link(b, y, p, 'y-1');
  return project(b, 'Digitizer: values read off the image of a graph');
}

function phaseDigiImage(): string {
  const u = (x: number) => 70 + 5 * x;
  const v = (t: number) => 340 - 0.62 * (t - 1000);
  const liq = Array.from({ length: 21 }, (_, k) => {
    const x = 5 * k;
    const t = 1085 + 3.7 * x + 0.0155 * x * (100 - x);
    return `${k ? 'L' : 'M'}${u(x).toFixed(1)},${v(t).toFixed(1)}`;
  }).join('');
  const sol = Array.from({ length: 21 }, (_, k) => {
    const x = 5 * k;
    const t = 1085 + 3.7 * x - 0.0185 * x * (100 - x);
    return `${k ? 'L' : 'M'}${u(x).toFixed(1)},${v(t).toFixed(1)}`;
  }).join('');
  const ticksX = Array.from({ length: 6 }, (_, k) => `<line x1="${u(20 * k)}" y1="340" x2="${u(20 * k)}" y2="346" stroke="#000"/><text x="${u(20 * k)}" y="362" text-anchor="middle">${20 * k}</text>`).join('');
  const ticksY = Array.from({ length: 6 }, (_, k) => {
    const t = 1000 + 100 * k;
    return `<line x1="64" y1="${v(t)}" x2="70" y2="${v(t)}" stroke="#000"/><text x="58" y="${v(t) + 4}" text-anchor="end">${t}</text>`;
  }).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" font-family="Arial" font-size="13">` +
    `<rect width="600" height="400" fill="#ffffff"/>` +
    `<rect x="70" y="30" width="500" height="310" fill="none" stroke="#000" stroke-width="1.2"/>` +
    ticksX +
    ticksY +
    `<text x="320" y="390" text-anchor="middle">Composition (wt% Ni)</text>` +
    `<text x="18" y="185" text-anchor="middle" transform="rotate(-90 18 185)">Temperature (°C)</text>` +
    `<path d="${liq}" fill="none" stroke="#c0392b" stroke-width="2"/>` +
    `<path d="${sol}" fill="none" stroke="#1f5fbf" stroke-width="2"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function phaseDigitizerExample(): Project {
  const b = builder();
  // the image's pixels of a composition (wt% Ni) and a temperature (°C); the lines clicked every 20 wt%
  const u = (x: number) => 70 + 5 * x;
  const v = (t: number) => 340 - 0.62 * (t - 1000);
  const at = (x: number, t: number) => ({ u: +u(x).toFixed(1), v: +v(t).toFixed(1) });
  const xs = [0, 20, 40, 60, 80, 100];
  const pd = add(b, 'phasedigitizer', 'pd-cuni', 0, 0, {
    ...PHASE_DIGITIZER_DEFAULTS,
    image: phaseDigiImage(),
    fileName: 'Cu_Ni_phase_diagram.svg',
    w: 600,
    h: 400,
    axes: [
      { u: 70, v: 340, val: 0 },
      { u: 570, v: 340, val: 100 },
      { u: 70, v: 340, val: 1000 },
      { u: 70, v: 30, val: 1500 },
    ],
    compA: 'Cu',
    compB: 'Ni',
    xUnit: 'wt%',
    yName: 'Temperature',
    yUnit: '°C',
    splines: [
      { id: 'sp-liq', name: 'Liquidus', color: '#d62728', points: xs.map((x) => at(x, 1085 + 3.7 * x + 0.0155 * x * (100 - x))) },
      { id: 'sp-sol', name: 'Solidus', color: '#1f77b4', points: xs.map((x) => at(x, 1085 + 3.7 * x - 0.0185 * x * (100 - x))) },
    ],
    activeSpline: 0,
    regions: [
      { id: 'reg1', name: 'L', color: REGION_COLORS[1], opacity: 0.25, labelPt: at(25, 1400) },
      { id: 'reg2', name: 'α + L', color: REGION_COLORS[2], opacity: 0.3, labelPt: at(66, 1325) },
      { id: 'reg3', name: 'α', color: REGION_COLORS[0], opacity: 0.25, labelPt: at(70, 1130) },
    ],
    leverPoints: [{ id: 'lp-1', name: 'P1', pt: at(45, 1250) }],
  });
  const wb = add(b, 'book', 'pd-book', 900, 0, { ...WORKBOOK_DEFAULTS, name: 'Cu-Ni lever rule', sheets: [], into: ['Cu-Ni lever rule'] });
  link(b, pd, wb, 'in-0', 'workbook');
  const cv = add(b, 'canvas', 'pd-canvas', 900, 420, { ...CANVAS_DEFAULTS, width: 120, height: 90, name: 'cu_ni_phase_diagram', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 1 } });
  link(b, pd, cv, 'figures', 'figure');
  return project(b, 'Cu-Ni phase diagram: Lever rule & dual components (wt.% Ni and wt.% Cu)');
}

// ---- Image analysis: the spots of a two-colour microarray (the image drawn here, so the answers can be checked): 3 rows
// (replicates A, B, C) of 6 spots, a gene each, its red / green ratio 2^(k − 2.5); the background a little uneven ----
const ARRAY = { w: 260, h: 170, cols: 6, rows: 3, x0: 40, dx: 36, y0: 40, dy: 45, r: 11 };
function arrayImage() {
  const { w, h } = ARRAY;
  const r = rng(11);
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // (a background brighter to the right, its noise)
      let R = 22 + (12 * x) / w + (r() - 0.5) * 8;
      let G = 20 + (10 * x) / w + (r() - 0.5) * 8;
      for (let j = 0; j < ARRAY.rows; j++)
        for (let k = 0; k < ARRAY.cols; k++) {
          const d = Math.hypot(x + 0.5 - (ARRAY.x0 + k * ARRAY.dx), y + 0.5 - (ARRAY.y0 + j * ARRAY.dy));
          if (d > ARRAY.r) continue;
          const ratio = Math.pow(2, k - 2.5);
          const f = 1 - (d / ARRAY.r) ** 4 * 0.3;
          R += 60 * f * Math.sqrt(ratio) * (0.9 + 0.1 * j);
          G += (60 * f) / Math.sqrt(ratio) * (0.9 + 0.1 * j);
        }
      const i = (y * w + x) * 3;
      px[i] = Math.min(255, Math.round(R));
      px[i + 1] = Math.min(255, Math.round(G));
      px[i + 2] = Math.round(8 + r() * 4);
    }
  return packPixels(w, h, 3, 8, px);
}
function microarrayExample(): Project {
  const b = builder();
  const rois: Roi[] = [];
  for (let j = 0; j < ARRAY.rows; j++)
    for (let k = 0; k < ARRAY.cols; k++) {
      const g = 'ABC'[j];
      rois.push({ id: `sp-${g}${k + 1}`, name: `${g}${k + 1}`, kind: 'ellipse', box: [ARRAY.x0 + k * ARRAY.dx, ARRAY.y0 + j * ARRAY.dy, 2 * ARRAY.r + 2, 2 * ARRAY.r + 2], group: g, bg: { mode: 'ring', gap: 2, width: 4 } });
    }
  // a line through row A (3 px wide): the red and green profiles across its spots
  rois.push({ id: 'pr-A', name: 'row A', kind: 'line', pts: [[10, ARRAY.y0], [ARRAY.w - 10, ARRAY.y0]], width: 3, color: '#ffffff' });
  // the global background: a rectangle on the empty band under the spots (every spot also against it)
  rois.push({ id: 'bg-global', name: 'global bg', kind: 'rect', box: [ARRAY.w / 2, ARRAY.h - 12, ARRAY.w - 20, 10], role: 'background', color: '#64d2ff' });
  const im = add(b, 'image', 'ma-image', 0, 0, {
    ...IMAGE_DEFAULTS,
    name: 'array_scan.tif',
    pixels: arrayImage(),
    pixelsId: 'example-microarray',
    rois,
    measure: { channels: 'each', ratio: [0, 1], keys: ['area', 'mean', 'median', 'sd', 'intden'], globalBg: 'bg-global' },
    figure: { width: 100, show: 'original', rois: 'labels' },
  });
  const wb = add(b, 'book', 'ma-book', 640, 0, { ...WORKBOOK_DEFAULTS, name: 'spots', sheets: [], into: ['spots'] });
  link(b, im, wb, 'in-0', 'workbook');
  const pr = add(
    b,
    'plot1d',
    'ma-profile',
    640,
    700,
    plot(
      {
        label: 'red',
        style: lineK(0, { color: '#d62728' }),
        cols: { x: 'row A distance (px)', y: 'row A R' },
        sheet: 'Profiles',
        rows: [{ label: 'green', style: lineK(0, { color: '#2ca02c' }), cols: { x: 'row A distance (px)', y: 'row A G' }, sheet: 'Profiles' }],
      },
      { axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Distance along row A (px)' }), left: side({ title: 'Value' }) } }, legend: { x: 96, y: 4, anchor: 'tr' }, page: { name: 'row_A_profile' } },
    ),
  );
  link(b, im, pr, 'dataset', 'workbook');
  add(b, 'note', 'ma-note', -560, 0, {
    ...NOTE_DEFAULTS,
    text: 'A two-colour microarray scan (red: the sample, green: the reference), 3 replicates (A, B, C) of 6 genes; the background brighter to the right, as scans often are.\n\nEvery spot is measured between two circles: the inner one is the spot (its signal F, an ellipse stamped on it); the outer one, 2 px further out and 4 px wide, is a ring of its own background B, just next to it (the other spots left out of it). Analyze ▸ Selections: rings shows both circles of every spot; pick a spot to change its ring (gap, width). A global background (the rectangle under the spots, picked in Measure ▸ Global bg) is measured too.\n\nThe Spots sheet, on each channel: F, the local B (mean, median, SD), the net signal F − B (the median of B taken off), the SNR = (F − B) / SD(B), and, against the global background, B global and Net global; the ratio R / G with its log2 (about −2.5 … +2.5 from gene 1 to gene 6, the same in the three replicates). The local ring follows the uneven background, the global one does not: compare Net and Net global along a row. The Summary sheet gives each replicate and all of them; the Plot, the red and green profiles along row A.',
  });
  return project(b, 'Microarray spots: signal over a ring of background, red / green ratio');
}

// ---- Image analysis: particles (the test images of testImages.ts: what is in them is known) ----
// the particles of an image through its steps, found as the editor finds them (Find particles); by shape: each put in
// the group of its shape (Group by shape)
function foundParticles(t: TestImage, steps: ImgStep[], rois: Roi[], separate: boolean, byShape: boolean, minSize = 10): Roi[] {
  const r: Raster = { w: t.w, h: t.h, ch: [Float32Array.from(t.px)], kind: 'gray', lo: 0, hi: 255 };
  const m = applySteps(r, steps, steps.length, undefined, 1, { train: trainingExamples(rois, 0, 0) }).r;
  return findParticles(m.ch[0], t.w, t.h, { ...PARTICLE_DEFAULTS, separate, minSize }).outlines.map((o, i): Roi => {
    const g = byShape ? shapeName(shapeFeatures({ id: '', name: '', kind: 'traced' }, o, tracedPerimeter(o))) : 'particles';
    return { id: `p${i + 1}`, name: `P${i + 1}`, kind: 'traced', pts: o, group: g, ...(byShape ? { color: SHAPE_COLORS[g] } : {}), auto: true };
  });
}
const otsuStep = (light: boolean): ImgStep => ({ ...newStep('threshold', 'st-otsu'), p: { ...newStep('threshold', 'st-otsu').p, method: 'otsu', light } });
// Gold by TEM: a high-resolution image (its spectrum's two {111} spots: d and the angle between the planes; a Bragg
// filter of them; the fringes along a line) and a diffraction pattern (its centre, its rings matched with gold)
function goldTemExample(): Project {
  const b = builder();
  const t = hrtemImage();
  add(b, 'image', 'tem-hr', 0, 0, {
    ...IMAGE_DEFAULTS,
    name: 'gold_hrtem.png',
    pixels: packPixels(t.w, t.h, 1, 8, t.px),
    pixelsId: 'example-gold-hrtem',
    steps: [{ ...newStep('fftmask', 'st-bragg'), on: false, p: { ...newStep('fftmask', 'st-bragg').p, spots: t.spots, mode: 'keep' } }],
    cal: { size: 0.02, unit: 'nm' },
    rois: [{ id: 'fr1', name: 'L1', kind: 'line', pts: [[100, 128 - 60 * Math.tan(0.35)], [220, 128 + 60 * Math.tan(0.35)]] }],
    lattice: { spots: t.spots, fringes: true },
    tab: 'lattice',
    figure: { width: 90 },
  });
  const sa = saedImage();
  add(b, 'image', 'tem-saed', 0, 900, {
    ...IMAGE_DEFAULTS,
    name: 'gold_saed.png',
    pixels: packPixels(sa.w, sa.h, 1, 8, sa.px),
    pixelsId: 'example-gold-saed',
    steps: [],
    cal: { size: 1, unit: 'nm' },
    lattice: { saed: true, recip: 0.07, phases: ['Au', 'Ag'] },
    tab: 'lattice',
    figure: { width: 90 },
  });
  const wb = add(b, 'book', 'tem-book', 700, 0, { ...WORKBOOK_DEFAULTS, name: 'lattice', sheets: [], into: [] });
  link(b, 'tem-hr', wb, 'in-0', 'workbook');
  link(b, 'tem-saed', wb, 'in-1', 'workbook');
  const pr = add(b, 'plot1d', 'tem-profile', 700, 900, plot({ label: 'radial profile', style: curve(0, { mode: 'line', lineWidth: 1 }), cols: { x: 'r (px)', y: 'Mean' }, sheet: 'Radial profile' }, { page: { name: 'saed_profile' } }));
  link(b, 'tem-saed', pr, 'dataset', 'workbook');
  return project(b, 'Gold by TEM: lattice spacing, Bragg filter, diffraction rings');
}

// An AFM scan: the scan lines' offsets and the tilt taken off (Scan lines, Level with the particles left out of the
// fit), the roughness (ISO 25178) of the image and of a selection, a profile's roughness (λc), the height histogram,
// the PSD and the autocorrelation, the depth of a trench (a step between two selections); the heights in 3D
function afmExample(): Project {
  const b = builder();
  const t = afmImage();
  const lv = newStep('level', 'st-level');
  const im = add(b, 'image', 'afm-image', 0, 0, {
    ...IMAGE_DEFAULTS,
    name: 'gold_on_substrate.gwy',
    pixels: packPixels(t.w, t.h, 1, 32, t.z),
    pixelsId: 'example-afm',
    steps: [newStep('scanlines', 'st-lines'), { ...lv, p: { ...lv.p, exclude: 15, zero: 'min' } }],
    cal: { size: 7.8125, unit: 'nm' },
    rois: [
      { id: 'top', name: 'Terrace', kind: 'rect', box: t.boxes.top },
      { id: 'base', name: 'Trench', kind: 'rect', box: t.boxes.base },
      { id: 'pl', name: 'L1', kind: 'line', pts: [[40, 20], [96, 20]] },
    ],
    surface: { zUnit: 'nm', areal: true, profile: true, lc: 150, hist: true, psd: true, acf: true, step: ['top', 'base'] },
    tab: 'surface',
    figure: { width: 90, lut: 'inferno' },
  });
  const wb = add(b, 'book', 'afm-book', 700, 0, { ...WORKBOOK_DEFAULTS, name: 'surface', sheets: [], into: [] });
  link(b, im, wb, 'in-0', 'workbook');
  const s3 = add(b, 'plot3d', 'afm-3d', 700, 700, { ...PLOT3D_DEFAULTS, kind: 'surface', cmap: 'inferno', mesh: 0, aspectZ: 0.35, azim: -60, elev: 35, page: { ...PLOT_PAGE_DEFAULTS, width: 85, height: 70, name: 'afm_3d' } });
  link(b, im, s3, 'dataset', 'matrix');
  const hi = add(b, 'plot1d', 'afm-hist', 1300, 0, plot({ label: 'heights', style: curve(0, { mode: 'line', lineWidth: 1.2 }), cols: { x: 'Height (nm)', y: 'Count' }, sheet: 'Height histogram' }, { page: { name: 'height_histogram' } }));
  link(b, im, hi, 'dataset', 'workbook');
  const ps = add(b, 'plot1d', 'afm-psd', 1300, 700, plot({ label: 'PSD', style: curve(1, { mode: 'line', lineWidth: 1.2 }), cols: { x: 'k (1/nm)', y: 'PSD (nm²·nm²)' }, sheet: 'PSD' }, { axes: { x: { ...AXES_STYLE_DEFAULTS.x, scale: 'log' }, y: { ...AXES_STYLE_DEFAULTS.y, scale: 'log' } }, page: { name: 'psd' } }));
  link(b, im, ps, 'dataset', 'workbook');
  return project(b, 'AFM: levelling, roughness, PSD and a step height');
}

// A nanoparticle monolayer: the particles found (a threshold, clusters cut apart), how they lie (Arrangement: their
// neighbours, the Voronoi cells, Clark–Evans R, ψ6, g(r)); then the other nodes: the size distribution with a
// log-normal fit (Histogram), D10, D50, D90 and the confidence interval (Descriptive statistics), g(r) in a Plot
function monolayerExample(): Project {
  const b = builder();
  const t = monolayerImage();
  const steps = [otsuStep(false), newStep('fillholes', 'st-fill')];
  const im = add(b, 'image', 'ml-image', 0, 0, {
    ...IMAGE_DEFAULTS,
    name: 'nanoparticle_monolayer.png',
    pixels: packPixels(t.w, t.h, 1, 8, t.px),
    pixelsId: 'example-monolayer',
    steps,
    cal: { size: 0.5, unit: 'nm' },
    rois: foundParticles(t, steps, [], true, false, 40),
    particles: { separate: true },
    measure: { keys: ['area', 'centroid', 'eqdiam', 'shape', 'nnd'] },
    arrange: { on: true, show: 'voronoi' },
    tab: 'objects',
    figure: { width: 110, rois: 'outlines' },
  });
  const hd = { ...HISTOGRAM_DEFAULTS, ys: 'Eq. diameter (nm)', sheet: 'Selections', opacity: 0.6, fits: [{ kind: 'lognormal' as const, method: 'data' as const, color: '#D55E00', width: 1.6 }], page: { ...PLOT_PAGE_DEFAULTS, name: 'particle_sizes' } };
  const hi = add(b, 'histogram', 'ml-hist', 700, 0, hd);
  link(b, im, hi, 'dataset', 'workbook');
  const ex = add(b, 'extract', 'ml-diam', 700, 760, { ...EXTRACT_DEFAULTS, sheet: 'Selections', column: 'Eq. diameter (nm)' });
  link(b, im, ex, 'in', 'workbook');
  const st = add(b, 'stats', 'ml-stats', 1200, 760, { pcts: '10, 50, 90', ci: 95 });
  link(b, ex, st, 'in');
  const gr = add(b, 'plot1d', 'ml-gr', 1200, 0, plot({ label: 'g(r)', style: curve(0, { mode: 'line', lineWidth: 1.2 }), cols: { x: 'r (nm)', y: 'g(r)' }, sheet: 'g(r)' }, { page: { name: 'pair_correlation' } }));
  link(b, im, gr, 'dataset', 'workbook');
  return project(b, 'Nanoparticle monolayer: neighbours, order and sizes');
}

// Nanoporous gold: a median filter, a threshold, and Structure on: its skeleton's ligaments (length, thickness), the
// junctions, the pores, in the workbook; the ligament lengths in a histogram
function porousExample(): Project {
  const b = builder();
  const t = porousImage();
  const im = add(b, 'image', 'np-image', 0, 0, {
    ...IMAGE_DEFAULTS,
    name: 'nanoporous_gold.png',
    pixels: packPixels(t.w, t.h, 1, 8, t.px),
    pixelsId: 'example-nanoporous-gold',
    steps: [newStep('median', 'st-median'), otsuStep(false)],
    cal: { size: 2, unit: 'nm' },
    network: { on: true },
    tab: 'structure',
    figure: { width: 110 },
  });
  const wb = add(b, 'book', 'np-book', 700, 0, { ...WORKBOOK_DEFAULTS, name: 'network', sheets: [], into: [] });
  link(b, im, wb, 'in-0', 'workbook');
  const hd = { ...HISTOGRAM_DEFAULTS, ys: 'Length (nm)', sheet: 'Ligaments', opacity: 0.6, page: { ...PLOT_PAGE_DEFAULTS, name: 'ligament_lengths' } };
  const hi = add(b, 'histogram', 'np-hist', 700, 700, hd);
  link(b, im, hi, 'dataset', 'workbook');
  return project(b, 'Nanoporous gold: ligaments from the skeleton');
}

function particlesExample(): Project {
  const b = builder();
  const shapes = shapesImage();
  const steps = [otsuStep(true), newStep('fillholes', 'st-fill')];
  const im = add(b, 'image', 'pa-shapes', 0, 0, {
    ...IMAGE_DEFAULTS,
    name: 'particles_shapes.png',
    pixels: packPixels(shapes.w, shapes.h, 1, 8, shapes.px),
    pixelsId: 'example-particles-shapes',
    steps,
    cal: { size: 0.2, unit: 'µm' },
    rois: foundParticles(shapes, steps, [], true, true),
    particles: { separate: true },
    measure: { keys: ['area', 'perimeter', 'centroid', 'feret', 'ellipse', 'shape', 'eqdiam', 'nnd'] },
    figure: { width: 110, rois: 'outlines' },
  });
  const wb = add(b, 'book', 'pa-book', 700, 0, { ...WORKBOOK_DEFAULTS, name: 'particles', sheets: [], into: ['particles'] });
  link(b, im, wb, 'in-0', 'workbook');
  const pl = add(
    b,
    'plot1d',
    'pa-plot',
    700,
    700,
    plot(
      { label: 'particles', style: curve(0, { mode: 'scatter', symbol: 'circle', symbolSize: 4 }), cols: { x: 'Area (µm²)', y: 'Circ.' }, sheet: 'Selections' },
      { axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Area (µm²)' }), left: side({ title: 'Circularity' }) } }, page: { name: 'circularity_area' } },
    ),
  );
  link(b, im, pl, 'dataset', 'workbook');
  // round particles in clusters: cut apart
  const cl = clustersImage();
  const cs = [otsuStep(false), newStep('fillholes', 'st-fill')];
  const im2 = add(b, 'image', 'pa-clusters', 0, 900, {
    ...IMAGE_DEFAULTS,
    name: 'particles_clusters.png',
    pixels: packPixels(cl.w, cl.h, 1, 8, cl.px),
    pixelsId: 'example-particles-clusters',
    steps: cs,
    cal: { size: 0.2, unit: 'µm' },
    rois: foundParticles(cl, cs, [], true, false),
    particles: { separate: true },
    measure: { keys: ['area', 'feret', 'eqdiam', 'shape', 'nnd'] },
    figure: { width: 110, rois: 'outlines' },
  });
  const wb2 = add(b, 'book', 'pa-book2', 700, 1300, { ...WORKBOOK_DEFAULTS, name: 'clusters', sheets: [], into: ['clusters'] });
  link(b, im2, wb2, 'in-0', 'workbook');
  add(b, 'note', 'pa-note', -560, 0, {
    text: 'Particles, as ImageJ’s Analyze Particles: a threshold (Otsu) and Fill holes make a mask; Find particles (in the editor, Particles) turns its objects into selections (touching ones cut apart along their necks) and Group by shape names each: circle, ellipse, triangle, square, rectangle, irregular.\n\nMeasured: area, perimeter, Feret (the length, its angle, the least width), the fitted ellipse, circularity, aspect ratio, roundness, solidity, corners, the equivalent diameter, the nearest neighbour (centre to centre, edge to edge) and Clark–Evans R in the Summary. Below: round particles in clusters of 2 to 4, all 42 found.',
  });
  return project(b, 'Particles: clusters cut apart, shapes named, their sizes');
}
function classifierExample(): Project {
  const b = builder();
  const tx = textureImage();
  // the examples: lines across four particles, the background in two rectangles and a line
  const line = (id: string, x: number, y: number, cls: string): Roi => ({ id, name: id, kind: 'line', pts: [[x - 6, y], [x + 6, y]], width: 3, train: cls, color: CLASS_COLORS[cls === 'object' ? 0 : 1] });
  const examples: Roi[] = [
    ...tx.truth.slice(0, 4).map((q, k) => line(`E${k + 1}`, q.cx, q.cy, 'object')),
    { id: 'E5', name: 'E5', kind: 'rect', box: [32.5, 10, 55, 10], train: 'background', color: CLASS_COLORS[1] },
    { id: 'E6', name: 'E6', kind: 'rect', box: [435, 340, 70, 20], train: 'background', color: CLASS_COLORS[1] },
    { ...line('E7', 100, 90, 'background'), pts: [[80, 90], [120, 90]] },
  ];
  const cls = { ...newStep('classify', 'st-forest'), p: { ...newStep('classify', 'st-forest').p, classes: 'object,background', target: 'object' } };
  const steps = [cls, newStep('fillholes', 'st-fill')];
  const im = add(b, 'image', 'tc-image', 0, 0, {
    ...IMAGE_DEFAULTS,
    name: 'particles_texture.png',
    pixels: packPixels(tx.w, tx.h, 1, 8, tx.px),
    pixelsId: 'example-particles-texture',
    steps,
    cal: { size: 0.5, unit: 'µm' },
    rois: [...examples, ...foundParticles(tx, steps, examples, false, false, 60)],
    measure: { keys: ['area', 'feret', 'eqdiam', 'shape'] },
    figure: { width: 100, show: 'overlay', rois: 'outlines' },
    particles: { minSize: 60 },
  });
  const wb = add(b, 'book', 'tc-book', 680, 0, { ...WORKBOOK_DEFAULTS, name: 'textured particles', sheets: [], into: ['textured particles'] });
  link(b, im, wb, 'in-0', 'workbook');
  const pl = add(
    b,
    'plot1d',
    'tc-plot',
    680,
    700,
    plot(
      { label: 'particles', style: curve(2, { mode: 'scatter', symbol: 'square', symbolSize: 4 }), cols: { x: 'Feret (µm)', y: 'MinFeret (µm)' }, sheet: 'Selections' },
      { axes: { sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Feret, the length (µm)' }), left: side({ title: 'MinFeret, the width (µm)' }) } }, page: { name: 'length_width' } },
    ),
  );
  link(b, im, pl, 'dataset', 'workbook');
  add(b, 'note', 'tc-note', -560, 0, {
    text: 'Grainy particles as bright on average as the ground: a threshold cannot find them (try Otsu instead of the classifier: about a hundred pieces). The trainable classifier (as ImageJ’s Trainable Weka Segmentation) learns from examples: four short lines on particles (object, red) and three on the ground (background, blue). A random forest on the pixels’ features at several scales (smoothed, gradient, Hessian, difference of Gaussians, local variance) finds all 24.\n\nIn the editor: draw a selection, pick it, + picked on its class in the step; the mask follows. Then Particles ▸ Find particles.',
  });
  return project(b, 'Trainable classifier: textured particles a threshold misses');
}

// Nanocubes touching side to side: found like one of them (its rectangle the model, the edges fitted), and the same
// image cut along the dark lines between them
function nanocubesExample(): Project {
  const b = builder();
  const t = cubesImage();
  const c = Float32Array.from(t.px);
  const one = t.truth.find((q) => q.cluster === undefined)!;
  // (the model: a rectangle drawn around one cube, turned as it is)
  const model: Roi = { id: 'model', name: 'model', kind: 'rect', box: [one.cx, one.cy, one.side!, one.side!], angle: -one.angle!, color: '#30d158' };
  const found = findLike(c, t.w, t.h, one.cx, one.cy, 0.5 * Math.hypot(one.side!, one.side!), { ...MATCH_DEFAULTS, sizes: 0.2 });
  const cubes: Roi[] = found
    .filter((m) => Math.hypot(m.x - one.cx, m.y - one.cy) > 0.5 * one.side!)
    .map((m, i) => {
      const turn = model.angle! + m.angle;
      const fb = fitBox(c, t.w, t.h, m.x, m.y, turn, one.side! * m.scale, one.side! * m.scale);
      return { id: `p${i + 1}`, name: `P${i + 1}`, kind: 'rect', box: [fb.x, fb.y, fb.w, fb.h], angle: turn, group: 'cubes', auto: true };
    });
  const pixels = packPixels(t.w, t.h, 1, 8, t.px);
  const im = add(b, 'image', 'nc-match', 0, 0, {
    ...IMAGE_DEFAULTS,
    name: 'nanocubes.png',
    pixels,
    pixelsId: 'example-nanocubes',
    steps: [],
    cal: { size: 5, unit: 'nm' },
    rois: [model, ...cubes],
    measure: { keys: ['area', 'box', 'feret', 'nnd'] },
    particles: { group: 'cubes' },
    match: { symmetry: 90, sizes: 0.2, min: 0.5, fit: true },
    figure: { width: 100, rois: 'outlines' },
  });
  const wb = add(b, 'book', 'nc-book', 680, 0, { ...WORKBOOK_DEFAULTS, name: 'nanocubes', sheets: [], into: ['nanocubes'] });
  link(b, im, wb, 'in-0', 'workbook');
  const pl = add(
    b,
    'plot1d',
    'nc-plot',
    680,
    700,
    plot(
      { label: 'cubes', style: curve(1, { mode: 'scatter', symbol: 'square', symbolSize: 4 }), cols: { x: 'Orientation (°)', y: 'Box length (nm)' }, sheet: 'Selections' },
      { axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 0, max: 90 }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Orientation (°)' }), left: side({ title: 'Side (nm)' }) } }, page: { name: 'side_orientation' } },
    ),
  );
  link(b, im, pl, 'dataset', 'workbook');
  // the same image: a threshold, the mask cut along the dark lines, its particles
  const steps = [otsuStep(false), newStep('splitlines', 'st-split')];
  const im2 = add(b, 'image', 'nc-split', 0, 900, {
    ...IMAGE_DEFAULTS,
    name: 'nanocubes.png',
    pixels,
    pixelsId: 'example-nanocubes-split',
    steps,
    cal: { size: 5, unit: 'nm' },
    rois: foundParticles(t, steps, [], false, false, 40),
    measure: { keys: ['area', 'box', 'shape'] },
    particles: { minSize: 40 },
    figure: { width: 100, show: 'overlay', rois: 'outlines' },
  });
  const wb2 = add(b, 'book', 'nc-book2', 680, 1300, { ...WORKBOOK_DEFAULTS, name: 'cut along the lines', sheets: [], into: ['cut along the lines'] });
  link(b, im2, wb2, 'in-0', 'workbook');
  add(b, 'note', 'nc-note', -560, 0, {
    text: 'Nanocubes that touch side to side: a threshold makes one blob of every cluster. Two ways to tell them apart.\n\n1. Find like this (top): a rectangle drawn around one cube (green, the model), picked; Particles ▸ Find like this finds every cube like it, turned any way (square: 0 to 90°), ± 20 % in size, and fits each one’s edges. Each cube is a turned rectangle: its side (Box length), its orientation; in the Summary, the mean orientation and the alignment.\n\n2. Split along dark lines (below): Otsu, then the mask cut where the thin dark lines between the cubes run; Find particles.',
  });
  return project(b, 'Nanocubes: found like one, their side and orientation');
}

// ---- Phase digitizer: problems as set in a materials course (the images drawn from simplified curves, so the answers
// can be checked) ----
type Curve2D = { pts: [number, number][]; color: string; dash?: boolean };
// the image of a diagram drawn from its curves in the data (an SVG: the frame, ticks, titles, the curves, the names of
// the regions), and the pixel of a value (where the clicks go)
function diagramImage(o: { w: number; h: number; frame: [number, number, number, number]; x: [number, number]; y: [number, number]; xt: number[]; yt: number[]; xTitle: string; yTitle: string; curves: Curve2D[]; labels: [string, number, number][] }) {
  const [L, T, W, H] = o.frame;
  const u = (x: number) => L + ((x - o.x[0]) / (o.x[1] - o.x[0])) * W;
  const v = (y: number) => T + H - ((y - o.y[0]) / (o.y[1] - o.y[0])) * H;
  const at = (x: number, y: number) => ({ u: +u(x).toFixed(2), v: +v(y).toFixed(2) });
  const path = (c: Curve2D) => `<path d="${c.pts.map(([x, y], k) => `${k ? 'L' : 'M'}${u(x).toFixed(1)},${v(y).toFixed(1)}`).join('')}" fill="none" stroke="${c.color}" stroke-width="2"${c.dash ? ' stroke-dasharray="6 4"' : ''}/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${o.w}" height="${o.h}" viewBox="0 0 ${o.w} ${o.h}" font-family="Arial" font-size="13">` +
    `<rect width="${o.w}" height="${o.h}" fill="#ffffff"/>` +
    `<rect x="${L}" y="${T}" width="${W}" height="${H}" fill="none" stroke="#000" stroke-width="1.2"/>` +
    o.xt.map((x) => `<line x1="${u(x)}" y1="${T + H}" x2="${u(x)}" y2="${T + H + 6}" stroke="#000"/><text x="${u(x)}" y="${T + H + 21}" text-anchor="middle">${x}</text>`).join('') +
    o.yt.map((y) => `<line x1="${L - 6}" y1="${v(y)}" x2="${L}" y2="${v(y)}" stroke="#000"/><text x="${L - 9}" y="${v(y) + 4}" text-anchor="end">${y}</text>`).join('') +
    `<text x="${L + W / 2}" y="${o.h - 8}" text-anchor="middle">${o.xTitle}</text>` +
    `<text x="18" y="${T + H / 2}" text-anchor="middle" transform="rotate(-90 18 ${T + H / 2})">${o.yTitle}</text>` +
    o.curves.map(path).join('') +
    o.labels.map(([s, x, y]) => `<text x="${u(x)}" y="${v(y) + 4}" text-anchor="middle" font-size="12" fill="#333">${s}</text>`).join('') +
    `</svg>`;
  return { image: `data:image/svg+xml,${encodeURIComponent(svg)}`, at, axes: [{ ...at(o.x[0], o.y[0]), val: o.x[0] }, { ...at(o.x[1], o.y[0]), val: o.x[1] }, { ...at(o.x[0], o.y[0]), val: o.y[0] }, { ...at(o.x[0], o.y[1]), val: o.y[1] }] };
}
const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, k) => a + ((b - a) * k) / n);

// Pb–Sn (eutectic at 183 °C, 61.9 wt% Sn; α to 18.3, β from 97.8 wt% Sn): the liquidus lines bent a little, the solvus
// lines x = 18.3 (T/183)² and 100 − 2.2 (T/183)²
export const PBSN = {
  liqA: (x: number) => 327 - 2.3263 * x - 0.01 * x * (61.9 - x),
  liqB: (x: number) => 183 + 1.2861 * (x - 61.9) - 0.01 * (x - 61.9) * (100 - x),
  solvA: (t: number) => 18.3 * (t / 183) ** 2,
  solvB: (t: number) => 100 - 2.2 * (t / 183) ** 2,
};
function pbSnExample(): Project {
  const b = builder();
  const { liqA, liqB, solvA, solvB } = PBSN;
  const g = diagramImage({
    w: 640,
    h: 420,
    frame: [70, 30, 540, 330],
    x: [0, 100],
    y: [0, 350],
    xt: [0, 20, 40, 60, 80, 100],
    yt: [0, 50, 100, 150, 200, 250, 300, 350],
    xTitle: 'Composition (wt% Sn)',
    yTitle: 'Temperature (°C)',
    curves: [
      { pts: range(0, 61.9, 40).map((x) => [x, liqA(x)]), color: '#c0392b' },
      { pts: range(61.9, 100, 30).map((x) => [x, liqB(x)]), color: '#c0392b' },
      { pts: [[0, 327], [18.3, 183]], color: '#1f5fbf' },
      { pts: [[97.8, 183], [100, 232]], color: '#1f5fbf' },
      { pts: range(183, 0, 30).map((t) => [solvA(t), t]), color: '#2e7d32' },
      { pts: range(183, 0, 30).map((t) => [solvB(t), t]), color: '#2e7d32' },
      { pts: [[18.3, 183], [97.8, 183]], color: '#000000' },
    ],
    labels: [['L', 25, 300], ['α + L', 28, 210], ['β + L', 92, 192], ['α', 4, 130], ['α + β', 70, 110]],
  });
  const at = g.at;
  const pd = add(b, 'phasedigitizer', 'pd-pbsn', 0, 0, {
    ...PHASE_DIGITIZER_DEFAULTS,
    image: g.image,
    fileName: 'Pb_Sn_phase_diagram.svg',
    w: 640,
    h: 420,
    axes: g.axes,
    compA: 'Pb',
    compB: 'Sn',
    xUnit: 'wt%',
    massA: 207.2,
    massB: 118.71,
    yName: 'Temperature',
    yUnit: '°C',
    splines: [
      { id: 'liqA', name: 'Liquidus Pb', color: '#d62728', points: [0, 15, 30, 45, 61.9].map((x) => at(x, liqA(x))) },
      { id: 'liqB', name: 'Liquidus Sn', color: '#d62728', points: [61.9, 75, 87.5, 100].map((x) => at(x, liqB(x))) },
      { id: 'solA', name: 'Solidus α', color: '#1f77b4', points: [at(0, 327), at(18.3, 183)] },
      { id: 'solB', name: 'Solidus β', color: '#1f77b4', points: [at(97.8, 183), at(100, 232)] },
      { id: 'svA', name: 'Solvus α', color: '#2ca02c', points: [183, 140, 100, 60, 0].map((t) => at(solvA(t), t)) },
      { id: 'svB', name: 'Solvus β', color: '#2ca02c', points: [183, 140, 100, 60, 0].map((t) => at(solvB(t), t)) },
      { id: 'eut', name: 'Eutectic', color: '#000000', points: [at(18.3, 183), at(97.8, 183)], invariant: true, micro: 'eutectic' },
    ],
    activeSpline: 0,
    regions: [
      { id: 'reg1', name: 'L', color: REGION_COLORS[1], opacity: 0.25, labelPt: at(25, 300) },
      { id: 'reg2', name: 'α + L', color: REGION_COLORS[2], opacity: 0.3, labelPt: at(28, 210) },
      { id: 'reg3', name: 'β + L', color: REGION_COLORS[3], opacity: 0.3, labelPt: at(92, 192) },
      { id: 'reg4', name: 'α', color: REGION_COLORS[0], opacity: 0.25, labelPt: at(4, 130) },
      { id: 'reg5', name: 'β', color: REGION_COLORS[4], opacity: 0.25, labelPt: at(99.4, 120) },
      { id: 'reg6', name: 'α + β', color: REGION_COLORS[6], opacity: 0.3, labelPt: at(70, 110) },
    ],
    leverPoints: [
      { id: 'p1', name: 'P1', pt: at(40, 150), color: '#e03131', colorA: '#1971c2', colorB: '#e8590c' },
      { id: 'p2', name: 'P2', pt: at(40, 300), color: '#7048e8', kind: 'path', dir: 'down' },
    ],
  });
  const wb = add(b, 'book', 'pbsn-book', 900, 0, { ...WORKBOOK_DEFAULTS, name: 'Pb-Sn', sheets: [], into: ['Pb-Sn'] });
  link(b, pd, wb, 'in-0', 'workbook');
  const cv = add(b, 'canvas', 'pbsn-canvas', 900, 420, { ...CANVAS_DEFAULTS, width: 120, height: 90, name: 'pb_sn_phase_diagram', layout: { ...CANVAS_LAYOUT_DEFAULTS, rows: 1, cols: 1 } });
  link(b, pd, cv, 'figures', 'figure');
  return project(b, 'Pb-Sn eutectic: phases, amounts and microconstituents of a 40 wt% Sn alloy');
}

// Fe–Fe₃C, the steel corner (eutectoid at 727 °C, 0.76 wt% C; ferrite to 0.022 wt% C; cementite at 6.7 wt% C, the
// right edge): the lines straight
export const FEC = { a3: (x: number) => 912 - 243.4 * x, acm: (x: number) => 727 + 304.3 * (x - 0.76), ag: (x: number) => 912 - (185 / 0.022) * x };
function steelExample(): Project {
  const b = builder();
  const { a3 } = FEC;
  const g = diagramImage({
    w: 900,
    h: 460,
    frame: [80, 30, 780, 380],
    x: [0, 6.7],
    y: [400, 1000],
    xt: [0, 1, 2, 3, 4, 5, 6, 6.7],
    yt: [400, 500, 600, 700, 800, 900, 1000],
    xTitle: 'Composition (wt% C)',
    yTitle: 'Temperature (°C)',
    curves: [
      { pts: [[0, 912], [0.76, 727]], color: '#1f5fbf' },
      { pts: [[0, 912], [0.022, 727]], color: '#1f5fbf' },
      { pts: [[0.022, 727], [0.008, 600], [0, 400]], color: '#2e7d32' },
      { pts: [[0.76, 727], [0.76 + 273 / 304.3, 1000]], color: '#c0392b' },
      { pts: [[0.022, 727], [6.7, 727]], color: '#000000' },
    ],
    labels: [['γ', 0.7, 950], ['γ + Fe₃C', 4.5, 860], ['α + Fe₃C', 4.5, 520], ['α + γ', 0.28, 760]],
  });
  const at = g.at;
  const pd = add(b, 'phasedigitizer', 'pd-steel', 0, 0, {
    ...PHASE_DIGITIZER_DEFAULTS,
    image: g.image,
    fileName: 'Fe_Fe3C_steel.svg',
    w: 900,
    h: 460,
    axes: g.axes,
    compA: 'Fe',
    compB: 'C',
    xUnit: 'wt%',
    yName: 'Temperature',
    yUnit: '°C',
    splines: [
      { id: 'a3', name: 'A3', color: '#1f77b4', points: [at(0, 912), at(0.76, a3(0.76))] },
      { id: 'ag', name: 'α / α + γ', color: '#1f77b4', points: [at(0, 912), at(0.022, 727)] },
      { id: 'sv', name: 'Solvus α', color: '#2ca02c', points: [at(0.022, 727), at(0.008, 600), at(0, 400)], smooth: false },
      { id: 'acm', name: 'Acm', color: '#d62728', points: [at(0.76, 727), at(0.76 + 273 / 304.3, 1000)] },
      { id: 'eut', name: 'Eutectoid', color: '#000000', points: [at(0.022, 727), at(6.7, 727)], invariant: true, micro: 'pearlite' },
    ],
    activeSpline: 0,
    regions: [
      { id: 'reg1', name: 'γ', color: REGION_COLORS[1], opacity: 0.25, labelPt: at(0.7, 950) },
      { id: 'reg2', name: 'α + γ', color: REGION_COLORS[2], opacity: 0.3, labelPt: at(0.28, 760) },
      { id: 'reg3', name: 'γ + Fe₃C', color: REGION_COLORS[3], opacity: 0.25, labelPt: at(4.5, 860) },
      { id: 'reg4', name: 'α + Fe₃C', color: REGION_COLORS[0], opacity: 0.25, labelPt: at(4.5, 520) },
    ],
    leverPoints: [
      { id: 'p1', name: 'P1', pt: at(0.4, 900), color: '#7048e8', kind: 'path', dir: 'down' },
      { id: 'p2', name: 'P2', pt: at(1.2, 950), color: '#e03131', kind: 'path', dir: 'down' },
      { id: 'p3', name: 'P3', pt: at(0.4, 760), color: '#0c8599', colorA: '#1971c2', colorB: '#e8590c' },
    ],
  });
  const wb = add(b, 'book', 'steel-book', 1100, 0, { ...WORKBOOK_DEFAULTS, name: 'Steel', sheets: [], into: ['Steel'] });
  link(b, pd, wb, 'in-0', 'workbook');
  return project(b, 'Fe-Fe3C: proeutectoid ferrite and pearlite in 0.40 and 1.20 wt% C steels');
}

// CO₂, a one-component (P–T) diagram: the sublimation and boiling lines P = 5.11 exp(k (T + 56.6)) through the triple
// point (−56.6 °C, 5.11 atm), the melting line almost upright; the critical point (31 °C, 73.8 atm) and the dashed
// lines of the supercritical fluid
export const CO2 = { sub: (t: number) => 5.11 * Math.exp(0.07449 * (t + 56.6)), vap: (t: number) => 5.11 * Math.exp(0.030485 * (t + 56.6)), melt: (p: number) => -56.6 + 0.08 * (p - 5.11) };
function co2Example(): Project {
  const b = builder();
  const { sub, vap, melt } = CO2;
  const g = diagramImage({
    w: 640,
    h: 420,
    frame: [70, 30, 540, 330],
    x: [-100, 50],
    y: [0, 100],
    xt: [-100, -75, -50, -25, 0, 25, 50],
    yt: [0, 20, 40, 60, 80, 100],
    xTitle: 'Temperature (°C)',
    yTitle: 'Pressure (atm)',
    curves: [
      { pts: range(-100, -56.6, 20).map((t) => [t, sub(t)]), color: '#2e7d32' },
      { pts: range(-56.6, 31, 40).map((t) => [t, vap(t)]), color: '#c0392b' },
      { pts: [[-56.6, 5.11], [melt(100), 100]], color: '#1f5fbf' },
      { pts: [[31, 73.8], [31, 100]], color: '#777777', dash: true },
      { pts: [[31, 73.8], [50, 73.8]], color: '#777777', dash: true },
    ],
    labels: [['Solid', -85, 40], ['Liquid', -35, 60], ['Gas', 10, 15], ['Supercritical', 40.5, 92]],
  });
  const at = g.at;
  const pd = add(b, 'phasedigitizer', 'pd-co2', 0, 0, {
    ...PHASE_DIGITIZER_DEFAULTS,
    image: g.image,
    fileName: 'CO2_phase_diagram.svg',
    w: 640,
    h: 420,
    axes: g.axes,
    compA: '',
    compB: 'Temperature',
    xUnit: '°C',
    yName: 'Pressure',
    yUnit: 'atm',
    splines: [
      { id: 'sub', name: 'Sublimation', color: '#2ca02c', points: [-100, -85, -70, -56.6].map((t) => at(t, sub(t))) },
      { id: 'vap', name: 'Boiling', color: '#d62728', points: [-56.6, -35, -10, 10, 31].map((t) => at(t, vap(t))) },
      { id: 'melt', name: 'Melting', color: '#1f77b4', points: [at(-56.6, 5.11), at(melt(100), 100)] },
      { id: 'tc', name: 'T critical', color: '#777777', points: [at(31, 73.8), at(31, 100)] },
      { id: 'pc', name: 'P critical', color: '#777777', points: [at(31, 73.8), at(50, 73.8)] },
    ],
    activeSpline: 0,
    regions: [
      { id: 'reg1', name: 'Solid', color: REGION_COLORS[1], opacity: 0.25, labelPt: at(-85, 40) },
      { id: 'reg2', name: 'Liquid', color: REGION_COLORS[2], opacity: 0.25, labelPt: at(-35, 60) },
      { id: 'reg3', name: 'Gas', color: REGION_COLORS[0], opacity: 0.25, labelPt: at(10, 15) },
      { id: 'reg4', name: 'Supercritical', color: REGION_COLORS[3], opacity: 0.3, labelPt: at(40.5, 92) },
    ],
    leverPoints: [
      { id: 'p1', name: 'P1', pt: at(-20, 30), color: '#e03131', kind: 'read' },
      { id: 'p2', name: 'P2', pt: at(40, 82), color: '#0c8599', kind: 'read' },
      { id: 'p3', name: 'P3', pt: at(-20, 5), color: '#7048e8', kind: 'path', dir: 'up' },
      { id: 'p4', name: 'P4', pt: at(-78.5, 30), color: '#f08c00', kind: 'path', dir: 'down' },
    ],
  });
  const wb = add(b, 'book', 'co2-book', 900, 0, { ...WORKBOOK_DEFAULTS, name: 'CO2', sheets: [], into: ['CO2'] });
  link(b, pd, wb, 'in-0', 'workbook');
  return project(b, 'CO2 pressure–temperature diagram: the phase at given conditions, compression and sublimation');
}

// ---- Python ----

// A Raman spectrum with three bands on a sloping background (example values).
function pyFile(): string {
  const r = rng(61);
  const G = (x: number, c: number, w: number) => Math.exp((-4 * Math.LN2 * (x - c) ** 2) / (w * w));
  const lines = ['Raman shift (cm⁻¹);Intensity (a.u.)'];
  for (let x = 1000; x <= 1800; x += 2) lines.push(`${x};${(0.1 + 0.00015 * (x - 1000) + 0.9 * G(x, 1150, 40) + 0.55 * G(x, 1350, 55) + 1.1 * G(x, 1600, 35) + 0.015 * gauss(r)).toFixed(4)}`);
  return lines.join('\n');
}

const PY_CODE = `# A: the spectrum (a Table: its columns by name; A.df is a pandas DataFrame).
# Every variable made here is an output of the node (peaks, fitted).
import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from scipy.optimize import curve_fit

def analyse(x, y):
    # the peaks: at least 0.2 above their surroundings, 15 points apart
    idx, _ = find_peaks(y, prominence=0.2, distance=15)

    # a straight line and a Gaussian for every peak, started at the peaks found
    def model(x, a0, a1, *p):
        out = a0 + a1 * x
        for h, c, w in zip(p[0::3], p[1::3], p[2::3]):
            out = out + h * np.exp(-4 * np.log(2) * (x - c) ** 2 / w ** 2)
        return out

    p0 = [float(y.min()), 0.0]
    for i in idx:
        p0 += [float(y[i]), float(x[i]), 40.0]
    best, cov = curve_fit(model, x, y, p0=p0)
    err = np.sqrt(np.diag(cov))
    peaks = pd.DataFrame({"center (cm⁻¹)": best[3::3], "± center": err[3::3],
                          "height": best[2::3], "FWHM (cm⁻¹)": np.abs(best[4::3])})
    # designated (X and Y) for the Plot
    fitted = roles(pd.DataFrame({"Raman shift (cm⁻¹)": x, "fit": model(x, *best)}), x="Raman shift (cm⁻¹)", y="fit")
    return peaks, fitted

peaks, fitted = analyse(A["Raman shift (cm⁻¹)"], A["Intensity (a.u.)"])
`;

function pythonExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'py-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'spectrum', fileName: 'raman_bands.txt', text: pyFile(), textId: 'py-1' });
  // not run until Run is pressed (the first run downloads Python): its outputs declared, to be connected
  const py = add(b, 'python', 'py-script', 680, 0, { ...PYTHON_DEFAULTS, code: PY_CODE, outs: [{ name: 'peaks', kind: 'dataset' }, { name: 'fitted', kind: 'dataset' }] });
  link(b, imp, py, 'in-0');
  const wb = add(b, 'book', 'py-peaks', 1400, 760, { ...WORKBOOK_DEFAULTS, name: 'peaks', sheets: [], into: ['peaks'] });
  link(b, py, wb, 'in-0', 'py-peaks');
  const p = add(
    b,
    'plot1d',
    'py-plot',
    1400,
    0,
    plot(
      {
        label: 'spectrum',
        style: curve(7, { mode: 'scatter', symbol: 'circle', symbolSize: 2, color: '#808080' }),
        cols: { x: 'Raman shift (cm⁻¹)', y: 'Intensity (a.u.)' },
        // the fit: from its own data port, by its designations (nothing before the first Run)
        rows: [{ label: 'fit (Python)', style: lineK(2) }],
      },
      {
        axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 1000, max: 1800 }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Raman shift (cm⁻¹)' }), left: side({ title: 'Intensity (a.u.)' }) } },
        legend: { x: 4, y: 4, anchor: 'tl' },
        page: { name: 'python_fit' },
      },
    ),
  );
  link(b, imp, p, 'dataset');
  link(b, py, p, 'series-1', 'py-fitted');
  return project(b, 'Python script: peaks found and fitted with scipy');
}

// ---- Figures and layout ----

// A photoluminescence spectrum: the band-edge emission, and two weak bands of trap states (example values).
function plFile(): string {
  const r = rng(71);
  const G = (x: number, c: number, w: number) => Math.exp((-4 * Math.LN2 * (x - c) ** 2) / (w * w));
  const lines = ['Wavelength (nm);PL (norm.)'];
  for (let x = 450; x <= 800; x += 1) lines.push(`${x};${(G(x, 520, 28) + 0.035 * G(x, 645, 30) + 0.025 * G(x, 690, 25) + 0.0015 * gauss(r)).toFixed(5)}`);
  return lines.join('\n');
}

function publicationExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'pub-file', 0, 0, { ...IMPORT_DEFAULTS, name: 'PL', fileName: 'pl_spectrum.txt', text: plFile(), textId: 'pub-1' });
  // the inset: the weak bands, enlarged
  const ins = add(
    b,
    'plot1d',
    'pub-inset',
    680,
    760,
    plot(
      { label: 'PL', style: lineK(1, { lineWidth: 1 }), cols: { x: 'Wavelength (nm)', y: 'PL (norm.)' } },
      { axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 600, max: 730, step: 50 }, y: { ...AXES_STYLE_DEFAULTS.y, min: 0, max: 0.05, step: 0.02 }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ showTitle: false }), left: side({ showTitle: false }) } }, page: { name: 'inset' } },
    ),
  );
  link(b, imp, ins, 'dataset');
  // the main figure, the inset in its upper right corner with the region it enlarges marked
  const main = add(
    b,
    'plot1d',
    'pub-main',
    680,
    0,
    {
      ...plot(
        { label: 'PL', style: lineK(1, { lineWidth: 1.2 }), cols: { x: 'Wavelength (nm)', y: 'PL (norm.)' } },
        { axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 450, max: 800 }, y: { ...AXES_STYLE_DEFAULTS.y, min: 0, max: 1.1 } , sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Wavelength (nm)' }), left: side({ title: 'PL intensity (norm.)' }) } }, page: { name: 'pl_figure' } },
      ),
      insets: [{ ...INSET_DEFAULTS, key: 'pub-inset', x: 52, y: 8, w: 44, h: 46, zoom: true }],
    },
  );
  link(b, imp, main, 'dataset');
  link(b, ins, main, 'insets', 'figure');
  // the drawing over the figure: arrows and labels pinned to data points (they follow the data when the axes change),
  // and the panel label
  const pinned = (id: string, at: [number, number], tip: [number, number], label: string, dx: number, dy: number): AnnotationItem[] => [
    { id: `${id}-arrow`, type: 'shape', pin: { at, ref: tip }, spec: { ...SHAPE_DEFAULTS, kind: 'arrow', coords: 'data', x1: tip[0] + dx, y1: tip[1] + dy, x2: tip[0], y2: tip[1], width: 0.6, headSize: 4 } },
    { id: `${id}-text`, type: 'text', pin: { at, ref: tip }, spec: { ...TEXT_SPEC_DEFAULTS, coords: 'data', x: tip[0] + dx + (dx < 0 ? -1 : 1), y: tip[1] + dy, anchor: dx < 0 ? 'cr' : 'cl', text: label, style: { size: 7 } } },
  ];
  const dr = add(b, 'drawing', 'pub-draw', 1400, 0, {
    ...DRAWING_DEFAULTS,
    name: 'pl_annotated',
    annotations: [
      ...pinned('edge', [533, 0.45], [40, 30], 'band-edge emission', 8, 4),
      ...pinned('trap', [668, 0.05], [60, 48], 'trap states', 5, -9),
      { id: 'panel', type: 'text', spec: { ...TEXT_SPEC_DEFAULTS, coords: 'data', x: 1, y: 0.5, anchor: 'tl', text: '(a)', style: { size: 9, bold: true } } },
    ],
  });
  link(b, main, dr, 'under', 'figure');
  return project(b, 'Publication figure: an inset and annotations over it');
}

// A small workflow kept in order: frames for its stages, the processing steps in a group, a reroute for a long
// connection.
function organizeExample(): Project {
  const b = builder();
  const imp = add(b, 'import', 'org-file', 30, 74, { ...IMPORT_DEFAULTS, name: 'spectrum', fileName: 'raman_bands.txt', text: pyFile(), textId: 'org-1' });
  const sm = add(b, 'smooth', 'org-smooth', 800, 74, { ...SMOOTH_DEFAULTS, method: 'savgol', points: 9, withData: false });
  link(b, imp, sm, 'in');
  const nm = add(b, 'normalize', 'org-norm', 1240, 74, { ...NORMALIZE_DEFAULTS, method: 'max' });
  link(b, sm, nm, 'in');
  const rr = add(b, 'reroute', 'org-route', 1300, 640, {});
  link(b, nm, rr, 'in');
  const p = add(
    b,
    'plot1d',
    'org-plot',
    30,
    74,
    plot(
      { label: 'smoothed, normalized', style: lineK(1) },
      { axes: { x: { ...AXES_STYLE_DEFAULTS.x, min: 1000, max: 1800 }, sides: { ...AXES_STYLE_DEFAULTS.sides, bottom: side({ title: 'Raman shift (cm⁻¹)' }), left: side({ title: 'Intensity (norm.)' }) } }, legend: { x: 4, y: 4, anchor: 'tl' }, page: { name: 'organized' } },
    ),
  );
  link(b, rr, p, 'series');
  // Smooth and Normalize as one group node (open it to see them)
  const g = makeGroup(b.nodes, b.edges, [sm, nm], (n) => (n.type === 'smooth' ? 'spectrum' : 'processed'), () => 'dataset')!;
  // the frames (their nodes are their children: placed relative to them)
  const frame = (id: string, name: string, color: string, x: number, y: number, w: number, h: number) => ({ id, type: 'frame', position: { x, y }, width: w, height: h, data: { name, color } }) as AppNode;
  const frames = [frame('org-f1', '1 · Load', FRAME_COLORS[1], 0, 0, 640, 680), frame('org-f2', '2 · Process (a group: open it)', FRAME_COLORS[2], 760, 0, 470, 260), frame('org-f3', '3 · Results', FRAME_COLORS[3], 1480, 0, 720, 990)];
  const nodes = g.nodes.map((n) =>
    n.id === imp ? ({ ...n, parentId: 'org-f1' } as AppNode) : n.id === g.groupId ? ({ ...n, parentId: 'org-f2', position: { x: 30, y: 74 } } as AppNode) : n.id === p ? ({ ...n, parentId: 'org-f3' } as AppNode) : n,
  );
  return project({ nodes: [...frames, ...nodes], edges: g.edges }, 'Organizing a large graph: frames, a group, a reroute');
}

// Every example's note at its left: what it shows, what to try, then how it works (the example's own note, when it has one).
type About = { what: string; try: string[] };
const ABOUT: Record<string, About> = {
  'UV-Vis spectrum: mean ± SD of three measurements': {
    what: 'An instrument export read as it is (header lines skipped, units, decimal commas), the mean ± SD of three replicates, and a finished figure with an arrow on the peak and an eV axis on top.',
    try: ['Double-click a value in the Import table and change it: the statistics and the figure follow.', 'Click the Plot and change the error bars or the colours in Options.', 'Export the figure (SVG, PDF, PNG under it) at its physical size.'],
  },
  'Generated data: a damped oscillation and noisy samples': {
    what: 'Data made without a file: Generate column gives the time and the noise, Math column computes the signals from them, one Plot draws three curves (one with its own X).',
    try: ['Change the formula of a Math column (e.g. the period 1.6 → 2).', 'Change the seed of the noise, or its SD.', 'Click ? on a node for what it does.'],
  },
  'Gold n, k: two blocks in one file (Split into columns)': {
    what: 'A file with two blocks written one under the other (wl, n, then wl, k) laid side by side by Split into columns; n on the left axis, k on its own right axis.',
    try: ['Look at the Import table: the second block starts after an empty line.', 'In Split into columns, change Blocks and see the columns it gives.'],
  },
  'Four runs in a workbook: Auto-extract': {
    what: 'A spreadsheet with a sheet per run: Auto-extract takes the same columns out of every sheet by rules (Time = X, Signal = Y, D = ±Y), and one Plot draws them all from their designations.',
    try: ['Change a rule of Auto-extract (e.g. leave a sheet out with !2).', 'Choose another sheet in Extract column.'],
  },
  'Cleaning a sensor log: order, repeats, gaps, spikes': {
    what: 'A logger file as it comes — rows out of order, times written twice, missing values, spikes, a column not needed — made clean step by step; every step is a node you can open, change or remove.',
    try: ['Open Clean data and switch the outlier test (MAD, IQR, Grubbs …); the Workbook lists every change.', 'In Data manipulation, click or drag on the graph to mask other points.', 'Remove the Filter & sort rows node’s sorting: the cleaned line goes back and forth.'],
  },
  'Replicate scans: mean ± SD on a common X': {
    what: 'Three scans on different wavelength grids averaged on a common grid, with their SD as a band; all their points pooled into one table.',
    try: ['In Average curves, switch the grid (every X, the X of the first scan, uniform).', 'Change the error style of the mean in the Plot (band or bars).'],
  },
  'Rows to columns: a voltage sweep turned into spectra': {
    what: 'A table saved the other way round (a row per voltage) turned so every voltage is a curve; the same spectra stacked into one long table; a table of text with units read as numbers.',
    try: ['In Rows to columns, set First column to the old names as text, then back to their numbers.', 'Change the template of the names (e.g. V = {v}): the legend follows.', 'In Convert columns, empty Columns: the node proposes the columns whose text looks like numbers.'],
  },
  'Difference spectrum: sample minus reference': {
    what: 'A sample measured with a 2 nm calibration error, moved back, then compared with its reference: the difference shows the band only the sample has.',
    try: ['Set the shift of Translate to 0: the difference shows the misalignment as wiggles.', 'Look at the second output of Curve math: sample / reference.'],
  },
  'Pb-Sn eutectic: phases, amounts and microconstituents of a 40 wt% Sn alloy': {
    what: 'A problem of a materials course on a (simplified) Pb–Sn diagram: for a 40 wt% Sn – 60 wt% Pb alloy, (a) at 150 °C the phases, their compositions and amounts (P1, the lever rule: α 12.3 and β 98.5 wt% Sn, 67.9 % α), (b) cooled from 300 °C (P2, a path): where it starts to solidify (225 °C), the eutectic at 183 °C, the primary α and the eutectic just above it (50.2 % and 49.8 %) and the α and β just below it (72.7 % and 27.3 %); with the molar masses of Pb and Sn the compositions in at% too (40 wt% Sn = 53.8 at% Sn).',
    try: [
      'Drag P1: the arms a and b (in their colours) and the amounts follow; the amount of α is b / (a + b).',
      'Drag P2 to 70 wt% Sn (a hypereutectic alloy): the primary phase becomes β.',
      'Open the Workbook: the sheets Lever rule, Paths and Microconstituents.',
    ],
  },
  'Fe-Fe3C: proeutectoid ferrite and pearlite in 0.40 and 1.20 wt% C steels': {
    what: 'Steels cooled slowly through the eutectoid (727 °C, 0.76 wt% C) on the steel corner of the Fe–Fe₃C diagram (straight lines): the 0.40 wt% C steel (P1) leaves γ at 815 °C, then 48.8 % proeutectoid ferrite and 51.2 % pearlite, and below 727 °C 94.3 % ferrite and 5.7 % cementite in all; the 1.20 wt% C steel (P2): 7.4 % proeutectoid cementite and 92.6 % pearlite; P3, the lever rule in α + γ at 760 °C. The eutectoid line is marked Invariant, its constituent named pearlite.',
    try: ['Move P1 to 0.76 wt% C: all pearlite.', 'Change the constituent of the eutectoid line (Border & splines): the tables follow.'],
  },
  'CO2 pressure–temperature diagram: the phase at given conditions, compression and sublimation': {
    what: 'A one-component diagram (simplified CO₂): X is the temperature and Y the pressure, no composition and no lever rule. Read points give the phase at given conditions (P1: liquid at −20 °C, 30 atm; P2: a supercritical fluid at 40 °C, 82 atm); a path up is a compression at constant temperature (P3: the gas condenses at about 15.7 atm at −20 °C), a path down a fall of pressure (P4: at −78.5 °C the solid sublimes at 1 atm, as dry ice).',
    try: ['Drag P3 left of the triple point (−56.6 °C): the gas becomes solid instead.', 'Add point ▸ Read, then click anywhere: the phase there.'],
  },
  'Cu-Ni phase diagram: Lever rule & dual components (wt.% Ni and wt.% Cu)': {
    what: 'The image of the Cu-Ni diagram (complete solubility) calibrated on its axes, the liquidus and the solidus clicked as splines (their ends on the border), the three regions they close (L, α + L, α), and the lever rule at 45 wt% Ni, 1250 °C: the tie line from the liquid at 35.1 wt% Ni to the solid α at 56.9 wt% Ni, 54.4 % liquid and 45.6 % α (the image was drawn from these curves).',
    try: [
      'Drag the point P1: its tie line, the compositions under it and the amounts follow; in L or in α it is one phase (100 %).',
      'Drag a point of the solidus: the regions follow the line.',
      'Add point, then click elsewhere in α + L; the Workbook gets a row per point (Ni and Cu of both phases) and a sheet per boundary.',
    ],
  },
  'Nanocubes: found like one, their side and orientation': {
    what: 'Nanocubes touching side to side, as an electron microscope shows them: found like one of them (template matching, any turn, the edges fitted) or by cutting the mask along the dark lines between them; each cube’s side, orientation and the alignment of all of them in a Workbook and a Plot.',
    try: ['Analyze (top): pick the green model, change Similarity or Sizes in Particles, then Find like this.', 'Draw a rectangle around another cube, turn it with its handle to fit, pick it, Find like this.', 'Analyze (below): change the Line width of Split along dark lines, then Find particles.'],
  },
  'Gold by TEM: lattice spacing, Bragg filter, diffraction rings': {
    what: 'The lattice of a crystal measured from its image: the spots of the spectrum, a Bragg filter, the fringes, and a diffraction pattern indexed with known phases.',
    try: ['Open the first image (Edit), Lattice tab: tick show the spectrum, click another spot.', 'Tick the Spectrum mask step on the left: the lattice alone, its fringes clean.', 'In the second image, tick Ag too: gold and silver are almost alike (their a differ by 0.2 %).'],
  },
  'AFM: levelling, roughness, PSD and a step height': {
    what: 'A height map analysed as Gwyddion would: the form taken off, the roughness by ISO 25178 and ISO 4287, the distributions of the heights, and the depth of a trench.',
    try: ['Open the editor (Edit), Surface tab: compare Sa of the image and of the Terrace (the particles raise it).', 'Turn the Level step off: the tilt adds to every roughness parameter.', 'Move the selections of the step: the depth of the trench stays near 3 nm.'],
  },
  'Nanoparticle monolayer: neighbours, order and sizes': {
    what: 'How particles lie and how big they are: Image analysis gives the data (sheets Selections, Neighbours, Arrangement, g(r)), the other nodes analyse them.',
    try: ['Open the editor, Objects tab, Arrangement: switch Show between nearest, Delaunay and Voronoi.', 'Look at the Arrangement sheet in the workbook: R near 2 and ψ6 near 1 mean an ordered layer.', 'In Descriptive statistics, change the percentiles (5, 50, 95).'],
  },
  'Nanoporous gold: ligaments from the skeleton': {
    what: 'The skeleton analysis used for nanoporous metals: the ligament length between junctions and the ligament thickness, measured on every ligament, with the junctions and the pores.',
    try: ['Open the editor (Edit) and the Structure tab: click a ligament to see its path, its circles and how its length is made.', 'Delete a few spurs, keep a short branch, then Learn from my edits.', 'Set Length to surface to surface and compare the medians in the Network sheet.'],
  },
  'Particles: clusters cut apart, shapes named, their sizes': {
    what: 'Two images in the Image analysis node: shapes of every kind and round particles in clusters; a threshold and Fill holes make the mask, its particles are found as selections (touching ones cut apart) and named by their shape; area, perimeter, Feret, ellipse, circularity, corners, nearest neighbours in a Workbook; circularity against area in a Plot.',
    try: ['Analyze ▸ Particles: change Clusters (cut apart, its tolerance) or the size range, then Find particles.', 'Pick a particle in the list and give it a group; give a few of each shape one, then Group like the examples.', 'Look at the Summary sheet: every shape’s count, mean size, and Clark–Evans R.'],
  },
  'Trainable classifier: textured particles a threshold misses': {
    what: 'Grainy particles as bright as their ground: the trainable classifier (a random forest, as ImageJ’s Trainable Weka Segmentation) learns them from a few lines drawn on particles and on the ground, then its mask gives the 24 particles, their length and width.',
    try: ['Analyze: switch the classifier off and put a Threshold instead: the particles are lost.', 'Draw another line on a particle, pick it, + picked on object: the mask follows.', 'Particles ▸ Find particles after a change of the examples.'],
  },
  'Kramers–Kronig (impedance): a stable cell passes, a drifting one fails': {
    what: 'The Lin-KK test of the Kramers–Kronig node on two spectra of one cell: as measured (the residuals within ±1 %) and with the cell changing during the sweep (the residuals leave the band with a trend).',
    try: ['Kramers–Kronig (each): Graph of residuals, then Nyquist.', 'Change the band (±%) in its options.', 'Connect your own spectrum (frequency, Z′, Z″) to the node.'],
  },
  'Kramers–Kronig (optical): n and k from a reflectance': {
    what: 'n and k found from a reflectance alone by the Kramers–Kronig node, drawn over the true ones of the solid the file was made from; the tails assumed beyond the data drawn dashed on the node.',
    try: ['Kramers–Kronig: Graph of R and its tails.', 'Change Above the data (the power) and see n and k move near the ends.', 'Try Below the data: Hagen–Rubens (for a metal).'],
  },
  'Kramers–Kronig (general): ε₁ from ε₂': {
    what: 'The real part of a response from its imaginary part: ε₁ found from ε₂ with ε∞ = 1, drawn over the true ε₁.',
    try: ['Change Re at ∞ and see ε₁ shift.', 'Find: Im from Re, on the true ε₁ (connect it as the part to transform).', 'Change Above the data (the power): 3 for an oscillator.'],
  },
  'Microarray spots: signal over a ring of background, red / green ratio': {
    what: 'The scan of a two-colour microarray in the Image analysis node: every spot an ellipse with a ring of background around it, measured on the red and the green channel; the net signals, their ratio and log2 ratio in a Workbook (Selections, Spots, Summary by replicate).',
    try: ['Analyze: pick a spot, change its ring (gap, width) or its background (a region drawn, the global one).', 'Stamp: pick a spot, then click elsewhere: a copy centred on the bright pixels there.', 'Look at the Spots sheet: log2 ratio R/G about −2.5 … +2.5 from gene 1 to gene 6.'],
  },
  'Digitizer: values read off the image of a graph': {
    what: 'The image of a graph calibrated on its axes and its curve’s points placed (as clicks on whole pixels): the values read lie on the curve the image was drawn from.',
    try: ['Open the Digitizer: drag a point, or add some with clicks.', 'Let it find the curve by its colour: Auto (by colour).', 'Open an image of your own (a figure of a paper).'],
  },
  'Overlapping peaks: peak deconvolution': {
    what: 'A peak hidden in the side of another, separated by fitting a baseline and three peaks together; every peak drawn filled, the table of the peaks in a Workbook.',
    try: ['Open the Peak analyzer and go through its steps: 1 Data, 2 Baseline, 3 Peaks, 4 Fit.', 'Change the shape of a peak, then Run analysis.', 'Look at the table of the peaks (center, FWHM, area %) in the Workbook.'],
  },
  'XPS: Shirley background and a spin–orbit doublet': {
    what: 'A Ni 2p spectrum: the Shirley background and one Voigt line made a doublet (its partner 17.3 eV higher, half the area, the same widths), fitted together.',
    try: ['In the Peak analyzer, switch the background to linear or Tougaard and run again.', 'Turn the doublet (2×) off and compare the fit.'],
  },
  'Raman on a fluorescence background: baselines from the data': {
    what: 'A background ten times the lines, removed by baselines found from the data, in three nodes: Peak analyzer (airPLS), Integrate (asymmetric least squares) and Peak width (SNIP).',
    try: ['Change the smoothness of a baseline and watch what is left above it.', 'Try another baseline of the list in the same node.'],
  },
  'Strong coupling: fit of every run, then the anticrossing': {
    what: 'Reflectance spectra of a microcavity for 23 thicknesses: a Fit of every run gives the two dips, a second Fit of their positions gives the Rabi splitting Ω.',
    try: ['Open Fit 1 and look at its parameter table: a row per thickness.', 'In Fit 2, see Ω and its error.', 'Look at the Plot: the spectra are coloured by the thickness.'],
  },
  'Calibration: unknowns, LOD and LOQ': {
    what: 'A weighted straight-line calibration used backwards: two unknown concentrations with their 95 % intervals, the limits of detection and quantification, the sensitivity.',
    try: ['Change the absorbance of an unknown in the Fit’s Use the fit.', 'Turn the weights off and compare the intervals.'],
  },
  'Kinetics and lifetimes: rate equations, reconvolution': {
    what: 'Two fits beyond a formula: rate equations A → B → C solved at every step of the fit, and a fluorescence decay fitted through the instrument response.',
    try: ['In the first Fit, change the starting values of k1 and k2 and fit again.', 'Turn Reconvolution off in the second Fit: the lifetime then includes the instrument’s.'],
  },
  'Equivalent circuit (EIS): R(RQ)W fitted, two points left out': {
    what: 'The Equivalent circuit node on an impedance spectrum whose columns are named as a potentiostat writes them: the frequency, Z′ and −Z″ found by their names (and shown, to be changed), the circuit R(RQ)W — R₀ + R_ct ∥ CPE + Warburg —, its starts guessed from the data, the fit with the two spoiled points left out: R₀ = 15.0 Ω, R_ct = 220 Ω, Y0 = 3.0·10⁻⁵ S·sⁿ, n = 0.87, W Y0 = 4.0·10⁻³ S·s^½, the values the spectrum was simulated from. The Nyquist and Bode plots side by side in a Merge.',
    try: [
      'Restore all: the spoiled points come back and pull the fit away; click them again to leave them out.',
      'Bode: |Z| and −phase against the frequency.',
      'Change the circuit to R(RQ): no Warburg — the low-frequency tail is missed (χ² grows).',
      'f: every point, and Values: the frequency and Z′, −Z″ beside every point.',
    ],
  },
  'Impedance: an equivalent circuit fitted, a Nyquist plot': {
    what: 'An equivalent circuit (R0 + R1 ∥ CPE) written with functions of your own, fitted to the real and imaginary parts at once; the Nyquist plot with equal scales.',
    try: ['Change the circuit’s formula in the Fit (e.g. a capacitor instead of the CPE).', 'In the Plot, set Axes ▸ Aspect back to free and see the arcs flatten.'],
  },
  'Signal processing: smooth, FFT, deconvolution, interpolation': {
    what: 'Four everyday operations on curves: smoothing and normalizing, the FFT spectrum and a low pass, deconvolving an instrument’s blur, reading two curves on a common X.',
    try: ['Change the Method or the Window of Smooth.', 'Move the cut-off of the FFT low pass.', 'Change the number of iterations of the deconvolution.'],
  },
  'Signals: PSD, a Butterworth filter, the Allan deviation': {
    what: 'The FFT node in three modes: the power spectral density of two tones in noise, a zero-phase Butterworth low pass, the Allan deviation of a drifting sensor.',
    try: ['Change the order or the cut-off of the Butterworth filter.', 'Change the segment length of the PSD and watch the noise floor.'],
  },
  'Cyclic voltammogram: area between the branches': {
    what: 'A potentiostat file with three cycles in one table: cut into cycles and into the pieces going up and coming back, the area between the branches, the peaks read off.',
    try: ['Drag the edges of the hatched region in Integrate.', 'Add a value to read in Pick points (e.g. 0.3 V).'],
  },
  'Laboratory: method comparison, agreement, distributions, power': {
    what: 'The questions of a laboratory: do two analyzers agree, do the pathologists grade alike, how long do the sensors last, how does the response grow with the dose, and how many animals the next study needs.',
    try: ['In Method comparison, set λ to 2: Deming with the second analyzer twice as variable.', 'In the κ of two pathologists, switch the weights to none: the near misses no longer count.', 'In Power & sample size, set Find to the power and n to 30.'],
  },
  'Clinical study: survival, ROC, contingency, regression': {
    what: 'A small clinical study: who lives longer on which treatment, how well a biomarker tells the responders, whether the treatment changes the response, and what the tumour size depends on.',
    try: ['In Survival, switch the test to Gehan–Breslow–Wilcoxon: the early deaths weigh more.', 'In ROC curve, set Best threshold to a sensitivity reached of 0.9: the threshold and the specificity it costs.', 'In Linear regression, tick interactions: does the marker act differently by stage?'],
  },
  'Drug study: ANOVA, t-test, nonparametric, correlation': {
    what: 'The three layouts of data the statistics nodes read — a column per group, indexed rows, a row per subject — with the tests that go with each.',
    try: ['Switch the post-hoc test of the one-way ANOVA (Tukey, Bonferroni, Dunnett …): its table follows.', 'Look at the normality of every group before the ANOVA.'],
  },
  'Python script: peaks found and fitted with scipy': {
    what: 'A spectrum given to a Python script: scipy finds the peaks and fits them; the peaks go to a Workbook, the fitted curve to the Plot. Nothing leaves the computer: Python runs in the browser.',
    try: ['Press Run in the Python script (the first time it downloads Python, about 10 MB): the fit appears in the Plot.', 'Change the prominence in find_peaks and run again.', 'Connect another dataset to A and use it in the code.'],
  },
  'Regression, PCA, power and a control chart': {
    what: 'Linear and logistic regression on several predictors, correlations with principal components, a t-test with its power, a control chart.',
    try: ['Leave a predictor out of the linear regression and compare R² and AIC.', 'Change the target power of the t-test.'],
  },
  'Two panels: colour by value, colour bar, spikes removed': {
    what: 'Points coloured by their value with a colour bar, two spikes removed by a rule of a Math column, and two Plots side by side in a Merge with a shared Y axis and panel labels.',
    try: ['In the Merge, change the rows and columns or the panel labels.', 'Remove the rule of the Math column: the spikes come back.'],
  },
  'Three Y axes and a broken X axis': {
    what: 'Three quantities of one run, each on its own Y axis (left, right, one moved out), and an X axis broken over the hours without data.',
    try: ['Click the Plot and move the third axis in Options ▸ Axes.', 'Change where the X axis is broken.'],
  },
  'Publication figure: an inset and annotations over it': {
    what: 'A figure finished for a paper: the weak bands enlarged in an inset with the region marked, arrows and labels drawn over it by a Figure Drawing — pinned to the data, so they follow when the axes change.',
    try: ['Open the Figure Drawing (its editor) and move a label, or add a shape.', 'Change the X limits of the main Plot: the arrows stay on their peaks.', 'Export the drawing’s figure (SVG, PDF, PNG).'],
  },
  'Organizing a large graph: frames, a group, a reroute': {
    what: 'How to keep a graph readable: frames name its stages (their nodes move with them), a group node holds several steps, a reroute point leads a long connection.',
    try: ['Open the group (its button or right-click) to see Smooth and Normalize; ← back returns.', 'Drag a frame by its title: its nodes move with it.', 'Double-click a connection to add another reroute point.'],
  },
  'Matrices: inverse, eigenvalues, SVD, a map as a matrix': {
    what: 'A matrix and a vector typed in, then step by step: the inverse, the determinant, the eigenvalues and vectors, the SVD, the solution of A·x = b; maps of the results.',
    try: ['Change a cell of the matrix A: every step is computed again.', 'Add a step in Matrix computation.'],
  },
  'Contour and heatmap: a reflectance map, scattered points': {
    what: 'A reflectance map given as a matrix, with labelled contour lines and a cut drawn by a Plot, and scattered points interpolated and drawn as filled levels.',
    try: ['Change the colour map or the number of levels.', 'Use the Reader to read a value off the map.'],
  },
  '3D: a surface, bars, clusters, a waterfall': {
    what: 'Four 3D plots in one Merge: a surface with its contours on the floor, 3D bars of a matrix, clusters of points, and a waterfall of spectra in depth.',
    try: ['Turn a plot with the mouse (Rotate), or zoom into it (Zoom).', 'Read values with the Reader, on the data or on the surface.', 'Add a mark (Marks ▸ + Arrow) and draw it on the figure.'],
  },
  '3D stacked maps: RSMs of five samples': {
    what: 'Reciprocal space maps of five samples stacked at their own heights, on a log colour scale, the two reflections side by side with one colour bar.',
    try: ['Choose the layers by hand (Layers ▸ my list).', 'Turn the view (Rotate) or change the elevation.'],
  },
  'Grouped bars with their values': {
    what: 'The mean measures of three species, a series per measure side by side, the values written above the bars.',
    try: ['Switch the Bar chart’s Arrangement to stacked or 100 % stacked.', 'Hide the values, or move them inside the bars.'],
  },
  'Stacked and 100 % stacked bars': {
    what: 'Counts stacked, then their shares, the values in the segments; the two charts in a Merge with one legend.',
    try: ['Change the hatching or the colours of a series.', 'Make the bars horizontal.'],
  },
  'Horizontal bars with errors': {
    what: 'A score per person with its error bar, the values beyond the bars, a gradient and rounded corners.',
    try: ['Sort the bars by their value.', 'Change the gradient or the corners.'],
  },
  'Bars from raw values: mean ± SD with the points': {
    what: 'Replicates by treatment and day: every bar is the mean ± SD of its values, the values drawn over it.',
    try: ['Switch the error from SD to SE or the 95 % CI.', 'Show the median or the count instead of the mean.'],
  },
  'Floating columns: a range per month': {
    what: 'Every bar from the minimum to the maximum of its month, with rounded corners and a shadow.',
    try: ['Change the shadow or the corners.', 'Switch the Arrangement to grouped to see the two columns.'],
  },
  'Waterfall: from the grants to the balance': {
    what: 'A bridge chart of a laboratory’s year: income up, expenses down from the running total, the balance as the last bar.',
    try: ['Change a value in the Import table and watch the running total.', 'Change the colours of the increases, decreases and total.'],
  },
  'Significance brackets on bars and boxes': {
    what: 'Four treatments with brackets between the bars (Welch t, Holm) and every treatment against the control on the boxes (Tukey), the brackets stacked so they do not cross.',
    try: ['Switch the test or the correction for the brackets.', 'Show p instead of stars, or hide the ns brackets.'],
  },
  'Box plots: notched, horizontal': {
    what: 'Four samples as notched boxes with the mean, then horizontal with the whiskers at the 5th and 95th percentiles; in a Merge.',
    try: ['Change the Whiskers (1.5 IQR, percentiles, min – max).', 'Show the values over the boxes.'],
  },
  'Box plot vs violin plot': {
    what: 'The same four samples as boxes and as violins with their quartile lines, on one Y axis.',
    try: ['Change the width of the violins’ kernel.', 'Put a box inside every violin.'],
  },
  'Grouped boxes from indexed data, with the values': {
    what: 'Indexed data (a value, a treatment and a day per row) as boxes side by side by day, with their means and every value beside them.',
    try: ['Swap the group and the subgroup.', 'Switch the values from swarm to jitter.'],
  },
  'Half violins and raincloud': {
    what: 'The same values as half violins with their boxes, and as horizontal rainclouds with the values below.',
    try: ['Change the gradient of the half violins.', 'Make the rainclouds vertical.'],
  },
  'Split violins: two subgroups': {
    what: 'A violin per treatment split in two: day 1 on the left, day 7 on the right, each with its quartile lines.',
    try: ['Change the colours of the two days.', 'Use one scale for all the violins.'],
  },
  'Histogram with two-mode fits': {
    what: 'A two-mode sample of particle sizes: hatched bins, two normal distributions from the data, two Gaussians fitted to the bars and a kernel density.',
    try: ['Change the Bins (width or number).', 'Show the counts, the density or the percent.'],
  },
  'Q-Q and normal probability plots': {
    what: '50 strengths against the normal distribution: a Q-Q plot with its band, then a normal probability axis with the fitted line.',
    try: ['Change the Distribution (lognormal, Weibull …) and compare.', 'Switch the Kind to ECDF or P-P.'],
  },
  'ECDF of two groups, bands and 1 − F': {
    what: 'The reaction times of two groups as ECDF steps with their 95 % bands, and as 1 − F with fitted lognormal curves.',
    try: ['Switch the band from simultaneous (DKW) to pointwise.', 'Fit another distribution.'],
  },
  'Weibull probability plot of failure times': {
    what: 'The hours to failure of two batches on a Weibull probability axis with the fitted lines; a P-P plot with its band.',
    try: ['Read the shape and the scale in the node.', 'Switch the Distribution to lognormal.'],
  },
  'Bland–Altman: two devices': {
    what: 'The agreement of two devices measuring blood pressure: the differences against the means, the bias and the limits of agreement with their intervals.',
    try: ['Switch the differences to % of the mean.', 'Colour the points by another column.'],
  },
  'Pie, doughnut and nested rings': {
    what: 'The energy sources of a grid as a pie with slices moved out, a doughnut with the total in the hole, and two years as nested rings.',
    try: ['Switch the Kind at the top of the options.', 'Move another slice out, or sort the slices.'],
  },
  'Polar: antenna pattern, wind rose, radar': {
    what: 'An antenna’s gain in dB on a half circle, a month of wind as polar bars, and three materials scored on six properties as radar polygons.',
    try: ['Change where 0° is and the direction of the angles.', 'Fill or unfill the radar polygons.'],
  },
  'Scatter matrix of four measures, three species': {
    what: 'Every pair of four measures as points coloured by species, their densities on the diagonal and the correlations above it.',
    try: ['Switch the diagonal to histograms.', 'Draw lines through the points.'],
  },
  'Ternary: soil texture, a diffusion path': {
    what: 'The clay, sand and silt of soil samples in the texture triangle, and a composition along a diffusion couple as a line.',
    try: ['Switch percents to fractions.', 'Change the grid step.'],
  },
  'Waterfall: reflectance vs thickness, a PL ridgeline': {
    what: 'The spectra of a sweep one behind the other, coloured by the thickness, and photoluminescence spectra from 10 to 300 K as a ridgeline.',
    try: ['Change the shift between the curves.', 'Switch the Fill (hiding, coloured, none).'],
  },
};

function withAbout(p: Project, name: string): Project {
  const a = ABOUT[name];
  if (!a) return p;
  const old = p.nodes.find((n) => n.type === 'note' && n.position.x === -560 && n.position.y === 0);
  const how = old ? (old.data as { text: string }).text : '';
  const text = [`What this shows\n${a.what}`, `Try\n${a.try.map((t) => `• ${t}`).join('\n')}`, ...(how ? [`How it works\n${how}`] : [])].join('\n\n');
  // tall enough for the text (measured: about 78 characters a line at this width, 18.5 px a line; the title bar and a margin)
  const lines = text.split('\n').reduce((k, l) => k + Math.max(1, Math.ceil(l.length / 78)), 0);
  const note = { id: old?.id ?? 'about', type: 'note', position: { x: -560, y: 0 }, width: 480, height: Math.min(1000, 76 + Math.ceil(18.5 * lines)), data: { text } } as AppNode;
  return { ...p, nodes: [note, ...p.nodes.filter((n) => n !== old)] };
}

const LIST: { group: string; name: string; desc: string; make: () => Project }[] = [
  { group: 'Getting started', name: 'UV-Vis spectrum: mean ± SD of three measurements', desc: 'Import (skipped lines, units line, decimal commas), Statistics on rows (mean ± SD of the replicates), Statistics on columns over a range of X, error bars, an arrow on the peak, an eV axis on top.', make: spectrumExample },
  { group: 'Getting started', name: 'Generated data: a damped oscillation and noisy samples', desc: 'Generate column (linspace, random), Math column, one Plot with three curves (one with its own X), legend.', make: generatedExample },
  { group: 'Getting started', name: 'Gold n, k: two blocks in one file (Split into columns)', desc: 'A file of optical constants with wl, n and then wl, k written under it: Split into columns lays the blocks side by side (wl, n, k) and one Plot draws n on the left axis, k on its own right axis.', make: nkExample },
  { group: 'Getting started', name: 'Four runs in a workbook: Auto-extract', desc: 'A spreadsheet workbook (a sheet per run), Auto-extract rules (Time = X, Signal = Y, column D = ±Y in every sheet, each Y named by its sheet), one Plot from the designations; Extract column from one sheet.', make: workbookExample },
  { group: 'Data preparation', name: 'Rows to columns: a voltage sweep turned into spectra', desc: 'A photocurrent map saved a row per voltage, a column per wavelength: Rows to columns turns it into a spectrum per voltage (the wavelengths read from the old names, every column keeping its voltage), drawn in one Plot; Stack columns lays the spectra one under the other (voltage, wavelength, photocurrent); Convert columns reads a table written as text (300 K, 1.21 ± 0.02 eV, 45 %) as numbers, the units into the names and the errors in their own column.', make: sweepExample },
  { group: 'Data preparation', name: 'Batch: the peak of every spectrum in a folder', desc: 'Six photoluminescence spectra, a file each (PL_50K … PL_300K, opened together as from a folder): a Batch smooths every spectrum and picks its maximum; the temperature read from the file names, the files in its order; the peak wavelength against the temperature in a Plot. Open the batch to see its steps on the first file.', make: batchExample },
  { group: 'Data preparation', name: 'Cleaning a sensor log: order, repeats, gaps, spikes', desc: 'A logger file as it comes: Columns leaves the battery out, Filter & sort rows puts the rows in time order and merges the times written twice, Clean data fills the missing temperatures and replaces the spikes (moving median), Data manipulation masks two humidity readings by hand; the raw and the cleaned data in one Plot, the changes in a Workbook.', make: loggerExample },
  { group: 'Data preparation', name: 'Replicate scans: mean ± SD on a common X', desc: 'Three scans on different wavelength grids: Average curves gives their mean ± SD on a common grid (a band in the Plot); Combine columns puts every point of the three scans in one table, in the order of the wavelength.', make: scansExample },
  { group: 'Data preparation', name: 'Difference spectrum: sample minus reference', desc: 'A sample measured 2 nm off: Translate moves it back, Curve math gives sample − reference and sample / reference on a common grid; the difference on its own axis shows the band the sample has more.', make: differenceExample },
  { group: 'Images', name: 'Nanocubes: found like one, their side and orientation', desc: 'Image analysis of nanocubes touching side to side: Find like this (template matching at any turn, the edges fitted) and Split along dark lines; each cube’s side and orientation, the alignment, in a Workbook and a Plot.', make: nanocubesExample },
  { group: 'Images', name: 'AFM: levelling, roughness, PSD and a step height', desc: 'An AFM scan made here (2 µm, heights in nm): Scan lines and Level (the particles left out of the fit) take off the offsets and the tilt; the Surface tab gives the roughness (Sa, Sq, Sz, Ssk, Sku, Sdq, Sdr) of the image and of a selection, Ra and Rz along a line, the height histogram, the PSD, the autocorrelation (Sal, Str) and the depth of the trench between two selections. The heights in 3D (the matrix to a Plot 3D).', make: afmExample },
  { group: 'Images', name: 'Gold by TEM: lattice spacing, Bragg filter, diffraction rings', desc: 'Two images made here. A high-resolution TEM image of a gold particle: its spectrum’s two {111} spots (d = 0.235 nm, 70.5° between the planes), a Bragg filter of them (a step, off: tick it), the period of the fringes along a line. A diffraction pattern of gold: its centre found, its rings, each matched with the reflections of gold (111, 200, 220, 311, 222). Open the editor, Lattice tab.', make: goldTemExample },
  { group: 'Images', name: 'Nanoparticle monolayer: neighbours, order and sizes', desc: 'A nanoparticle monolayer (made here): its particles found, then Arrangement: every particle’s nearest, its Delaunay neighbours and Voronoi cell (drawn, coloured by their neighbours), Clark–Evans R, the hexatic order ψ6, the clusters, g(r) and Ripley’s L; the data analysed by the other nodes: the size distribution with a log-normal fit, D10, D50, D90 and the 95 % confidence interval, g(r) in a Plot.', make: monolayerExample },
  { group: 'Images', name: 'Nanoporous gold: ligaments from the skeleton', desc: 'A nanoporous gold image (made here): a median filter and a threshold make the mask; Structure thins it to its skeleton and measures every ligament between two junctions (its length, its thickness from the inscribed circles), the junctions and the pores, in the workbook; the ligament lengths in a histogram. Open the editor: the Structure tab draws the network, a click on a ligament shows how it was measured.', make: porousExample },
  { group: 'Images', name: 'Particles: clusters cut apart, shapes named, their sizes', desc: 'Image analysis: the particles of a mask as selections (touching ones cut apart), named by their shape (circle, triangle, square …), measured (area, perimeter, Feret, ellipse, circularity, corners, nearest neighbours), in a Workbook and a Plot.', make: particlesExample },
  { group: 'Images', name: 'Trainable classifier: textured particles a threshold misses', desc: 'Image analysis: a random forest taught by a few lines drawn on particles and on the ground (as ImageJ’s Trainable Weka Segmentation) finds grainy particles a threshold cannot; their length and width in a Plot.', make: classifierExample },
  { group: 'Images', name: 'Microarray spots: signal over a ring of background, red / green ratio', desc: 'Image analysis of a two-colour microarray scan: spots stamped as ellipses, a ring of background around each, measured on the red and green channels (net signal, SNR, ratio and log2 ratio, a summary by replicate) in a Workbook.', make: microarrayExample },
  { group: 'Data preparation', name: 'Digitizer: values read off the image of a graph', desc: 'The image of a published graph, calibrated on its axes, the points of its curve placed; the values read compared with the curve it was drawn from.', make: digitizerExample },
  { group: 'Phase diagrams', name: 'Cu-Ni phase diagram: Lever rule & dual components (wt.% Ni and wt.% Cu)', desc: 'The image of a Cu-Ni phase diagram calibrated on its axes, the liquidus and solidus clicked as splines, the regions L, α + L, α they close, and the lever rule at a point: the compositions and amounts of the liquid and the solid.', make: phaseDigitizerExample },
  { group: 'Phase diagrams', name: 'Pb-Sn eutectic: phases, amounts and microconstituents of a 40 wt% Sn alloy', desc: 'A Pb–Sn diagram read off its image: the lever rule at 150 °C (the arms coloured), the alloy cooled from 300 °C with the primary α and the eutectic, the compositions in wt% and at%.', make: pbSnExample },
  { group: 'Phase diagrams', name: 'Fe-Fe3C: proeutectoid ferrite and pearlite in 0.40 and 1.20 wt% C steels', desc: 'The steel corner of the Fe–Fe₃C diagram: two steels cooled through the eutectoid — the proeutectoid ferrite or cementite and the pearlite, the ferrite and cementite in all.', make: steelExample },
  { group: 'Phase diagrams', name: 'CO2 pressure–temperature diagram: the phase at given conditions, compression and sublimation', desc: 'A one-component P–T diagram: the phase at given conditions, a compression at constant temperature, the sublimation of dry ice.', make: co2Example },
  { group: 'Spectroscopy & optics', name: 'Overlapping peaks: peak deconvolution', desc: 'A spectrum with a peak hidden in the side of another: Peak analyzer fits a baseline and three peaks (each its shape) together, separating them; the data, every peak and their sum (the envelope) go to a Plot, the table of the peaks (center, height, FWHM, area %) to a Workbook.', make: overlapExample },
  { group: 'Spectroscopy & optics', name: 'XPS: Shirley background and a spin–orbit doublet', desc: 'A Ni 2p spectrum: Peak analyzer with the Shirley background and one exact Voigt line made a doublet (2×: 17.3 eV, half the area, the same widths — linked in the fit); the lines filled down to the background.', make: xpsExample },
  { group: 'Spectroscopy & optics', name: 'Raman on a fluorescence background: baselines from the data', desc: 'One list of baselines in three nodes, found from the data: airPLS under four fitted lines (Peak analyzer), asymmetric least squares under the integrated ranges (Integrate), SNIP under the measured widths (Peak width).', make: ramanBaselineExample },
  { group: 'Spectroscopy & optics', name: 'Strong coupling: fit of every run, then the anticrossing', desc: 'R(λ) of a microcavity with an exciton for 23 cavity thicknesses (computed by transfer matrices, one table): a Fit of every run (two Lorentzian dips), then a Fit of both polariton branches together (coupled-oscillator dispersion) giving the splitting Ω; the fits drawn by Plots like any data.', make: strongCouplingExample },
  { group: 'Spectroscopy & optics', name: 'Kramers–Kronig (optical): n and k from a reflectance', desc: 'n and k from a reflectance alone, over the true ones; the tails assumed beyond the data drawn dashed.', make: kkOpticalExample },
  { group: 'Spectroscopy & optics', name: 'Kramers–Kronig (general): ε₁ from ε₂', desc: 'The real part of a response from its imaginary part (ε₁ from ε₂ with ε∞), over the true ε₁.', make: kkGeneralExample },
  { group: 'Fitting', name: 'Calibration: unknowns, LOD and LOQ', desc: 'A weighted straight-line calibration; Use the fit: two unknowns read backwards with their 95 % intervals (3 replicates each), the limits of detection and quantification, the sensitivity with its error — to a Workbook; the line with its prediction band.', make: calibrationExample },
  { group: 'Fitting', name: 'Kinetics and lifetimes: rate equations, reconvolution', desc: 'Fit ▸ Equations: A → B → C fitted from the intermediate B (dA/dt, dB/dt solved numerically); a fluorescence decay fitted through the instrument response (reconvolution with the IRF, its shift and background), on a log axis.', make: kineticsExample },
  { group: 'Electrochemistry & impedance', name: 'Equivalent circuit (EIS): R(RQ)W fitted, two points left out', desc: 'An impedance spectrum fitted with R₀ + R_ct ∥ CPE + Warburg (Boukamp’s code), the columns found by their roles, two spoiled points left out with a click; Nyquist and Bode.', make: eisExample },
  { group: 'Electrochemistry & impedance', name: 'Impedance: an equivalent circuit fitted, a Nyquist plot', desc: 'Fit ▸ Complex: R0 + R1 ∥ CPE written with functions of your own, fitted to Re Z and −Im Z at once; the Nyquist plot with equal scales (Aspect = 1).', make: impedanceExample },
  { group: 'Electrochemistry & impedance', name: 'Kramers–Kronig (impedance): a stable cell passes, a drifting one fails', desc: 'The Lin-KK test on two spectra of one cell: as measured, the residuals within ±1 %; with the cell changing during the sweep, out of the band with a trend.', make: kkImpedanceExample },
  { group: 'Signals', name: 'Signal processing: smooth, FFT, deconvolution, interpolation', desc: 'A noisy spectrum smoothed (Savitzky–Golay) and normalized; the FFT spectrum of a sampled signal and an FFT low pass; a spectrum blurred by the instrument deconvolved (Richardson–Lucy); two curves on different X read on a common X (spline).', make: signalExample },
  { group: 'Signals', name: 'Signals: PSD, a Butterworth filter, the Allan deviation', desc: 'The FFT node in three modes: the power spectral density (Welch, dB), a zero-phase Butterworth low pass, the Allan deviation of a drifting sensor on log–log axes.', make: spectralExample },
  { group: 'Electrochemistry & impedance', name: 'Cyclic voltammogram: area between the branches', desc: 'A potentiostat file with three cycles in one table: Split into columns makes a current column per cycle (a Plot coloured by the cycle) and cuts the pieces going up and coming back; Integrate takes the area between them, absolute, over a region (hatched); Pick points reads the peaks and the current at 0.5 V.', make: cvExample },
  { group: 'Statistics', name: 'Laboratory: method comparison, agreement, distributions, power', desc: 'Data made here. Two analyzers on 50 samples (Passing–Bablok and Deming, with the data in a Plot; Lin’s concordance); three pathologists grading 60 biopsies (Cohen’s weighted κ, Fleiss’s κ, the ICC of their scores); 40 sensor lifetimes (five distributions fitted and ranked, the bootstrap interval of the median life); dose and response of 160 animals (logistic regression, its ROC curve); the size of the next study (Power & sample size with its curve).', make: labExample },
  { group: 'Statistics', name: 'Clinical study: survival, ROC, contingency, regression', desc: '120 patients made here, in two arms: Kaplan–Meier curves with the censored times, the log-rank test and the hazard ratio; a biomarker and the age as ROC curves (AUC, DeLong, the best threshold); the arm against the response (χ², Fisher, the odds ratio); the tumour size against age, marker and stage (linear regression, its p adjusted by Holm).', make: clinicalExample },
  { group: 'Statistics', name: 'Drug study: ANOVA, t-test, nonparametric, correlation', desc: 'The three layouts of the data for the statistics nodes — each group a column, indexed (value + factors), a row per subject — with Normality & outliers, one-way ANOVA + Tukey (the means ± SE in a Plot), a t-test, Kruskal–Wallis + Dunn, two-way ANOVA (Dose × Sex), repeated-measures ANOVA, Friedman and correlations.', make: drugExample },
  { group: 'Fitting', name: 'Python script: peaks found and fitted with scipy', desc: 'A spectrum given to a Python script: scipy finds its peaks and fits a Gaussian for each on a straight line; the table of the peaks to a Workbook, the fit drawn over the data. Runs when Run is pressed (the first time Python is downloaded, about 10 MB).', make: pythonExample },
  { group: 'Statistics', name: 'Regression, PCA, power and a control chart', desc: 'Fit ▸ linear and logistic regression on several predictors, Correlation with a clustered matrix and principal components (scores plotted), a t-test with its power, a control chart from Descriptive statistics.', make: regressionExample },
  { group: 'Figures & layout', name: 'Two panels: colour by value, colour bar, spikes removed', desc: 'Points coloured by their value with a colour bar, two spikes emptied by a Math column rule (rows 12, 37 → NaN), a shaded band; a Merge puts the two Plots side by side with a shared Y axis and panel labels (a), (b).', make: panelsExample },
  { group: 'Figures & layout', name: 'Three Y axes and a broken X axis', desc: 'Signal, temperature and pressure of one run, each on its own Y axis (left, right, a third one moved out); the X axis broken over the hours without data.', make: multiAxisExample },
  { group: 'Figures & layout', name: 'Publication figure: an inset and annotations over it', desc: 'A spectrum with its weak bands enlarged in an inset (the region marked), and a Figure Drawing over the figure: arrows and labels pinned to data points, a panel label; the drawing is the figure to export.', make: publicationExample },
  { group: 'Figures & layout', name: 'Organizing a large graph: frames, a group, a reroute', desc: 'A small workflow kept in order: a frame for every stage, Smooth and Normalize in one group node (open it to see them), a reroute point to lead a long connection.', make: organizeExample },
  { group: 'Matrices & 3D', name: 'Matrices: inverse, eigenvalues, SVD, a map as a matrix', desc: 'A matrix A and a vector b typed in; Matrix computation in steps — A⁻¹, A⁻¹·A (= I), det A, the eigenvalues and vectors, the SVD, the solution of A·x = b —, every result on its own port; Contour / heatmap draws A⁻¹ and the eigenvectors with their values in the cells, and a reflectance map read as a matrix (the angle and the wavelengths kept as its Y and X).', make: matrixExample },
  { group: 'Matrices & 3D', name: 'Contour and heatmap: a reflectance map, scattered points', desc: 'A reflectance map R(λ, θ) given as a matrix (the angle, then a column per wavelength) — smooth, with labelled contour lines and a cut at 30° drawn by a Plot —, and 250 scattered points of a surface interpolated on their triangles and drawn as filled levels with their lines.', make: contourExample },
  { group: 'Matrices & 3D', name: '3D: a surface, bars, clusters, a waterfall', desc: 'A surface of two peaks and a dip (a mesh every 4 cells, its contour lines on the floor), a year’s rainfall at four stations as 3D bars (a matrix), three clusters of points with lines down to the floor, and the microcavity’s reflectance for 23 thicknesses in depth (a 3D waterfall with walls) — in one Merge.', make: plot3dExample },
  { group: 'Matrices & 3D', name: '3D stacked maps: RSMs of five samples', desc: 'Reciprocal space maps (Qx, Qz, intensity; example values) of five samples, one table per reflection with a column naming the sample: 3D plot ▸ stacked maps finds the samples by their labels (S1 … S5; Layers ▸ my list chooses every layer by hand) and puts every sample’s map flat at its own height — the counts below 8 left out, the colours on a log scale —, a dashed vertical line through the stack and a rectangle on the floor; the two reflections side by side in a Merge with one colour scale and one colour bar. ⟲ Rotate turns a view with the mouse.', make: rsmExample },
  { group: 'Charts: bars', name: 'Grouped bars with their values', desc: 'The mean bill and flipper measures of three penguin species, a series per measure side by side, the values written above the bars.', make: groupedBarsExample },
  { group: 'Charts: bars', name: 'Stacked and 100 % stacked bars', desc: 'Counts stacked, then their shares (hatched), the values in the middle of the segments; the two charts in a Merge with one legend below them.', make: stackedBarsExample },
  { group: 'Charts: bars', name: 'Horizontal bars with errors', desc: 'A score per person with its error bar, the values beyond the bars, a gradient and rounded corners.', make: horizontalBarsExample },
  { group: 'Charts: bars', name: 'Bars from raw values: mean ± SD with the points', desc: 'Replicate measurements by treatment and day, every bar the mean ± SD of its values, the values drawn over the bars.', make: rawBarsExample },
  { group: 'Charts: bars', name: 'Floating columns: a range per month', desc: 'Every bar from the minimum to the maximum of its month (example values), rounded corners and a shadow.', make: floatingBarsExample },
  { group: 'Charts: bars', name: 'Waterfall: from the grants to the balance', desc: 'A waterfall (bridge) chart of a laboratory’s year — income up, expenses down from the running total, the balance as the last bar, dashed connectors, every change written on its bar; increases, decreases and the total in colours of their own (Bar chart ▸ Arrangement ▸ waterfall).', make: waterfallExample },
  { group: 'Charts: bars', name: 'Significance brackets on bars and boxes', desc: 'Four treatments, mean ± SD bars with the values and brackets between neighbours (Welch t, Holm), boxes with every treatment against the control (Tukey HSD, stars and p, ns shown); the brackets stacked so they do not cross.', make: significanceExample },
  { group: 'Charts: box & violin', name: 'Box plots: notched, horizontal', desc: 'Four samples (one with outliers) as notched boxes with the mean; the same horizontal with whiskers at the 5th and 95th percentiles, hatched; in a Merge.', make: boxPlotsExample },
  { group: 'Charts: box & violin', name: 'Box plot vs violin plot', desc: 'The same four samples as boxes and as violins with their quartile lines, one Y axis in a Merge.', make: boxVsViolinExample },
  { group: 'Charts: box & violin', name: 'Grouped boxes from indexed data, with the values', desc: 'Indexed data (a value, a treatment and a day per row): the response of every treatment by day, boxes side by side with their means, every value beside them as a swarm.', make: groupedBoxExample },
  { group: 'Charts: box & violin', name: 'Half violins and raincloud', desc: 'The same values as half violins (gradient) with their boxes, and as horizontal rainclouds with the values below.', make: rainExample },
  { group: 'Charts: box & violin', name: 'Split violins: two subgroups', desc: 'A split violin per treatment: day 1 on the left, day 7 on the right, each with its quartile lines.', make: splitViolinExample },
  { group: 'Charts: distributions', name: 'Histogram with two-mode fits', desc: 'A two-mode sample of particle sizes: bins of 1.5 nm, hatched; two normals from the data (maximum likelihood), two Gaussians fitted to the bars and a kernel density, their parameters in the node.', make: histogramExample },
  { group: 'Charts: distributions', name: 'Q-Q and normal probability plots', desc: '50 tensile strengths against the normal distribution — the quantiles with the line through the quartiles and its 95 % pointwise band, then the values on a normal probability axis (in %) with the fitted line and its band; r, Anderson–Darling and its p in the nodes.', make: qqProbabilityExample },
  { group: 'Charts: distributions', name: 'ECDF of two groups, bands and 1 − F', desc: 'The reaction times of two groups (indexed data) as ECDF steps with their simultaneous 95 % bands (DKW), and as 1 − F with the fitted lognormal CDFs.', make: ecdfExample },
  { group: 'Charts: distributions', name: 'Weibull probability plot of failure times', desc: 'A Weibull plot as in reliability work: the hours to failure of two batches on a Weibull probability axis with the hours on a log axis, the fitted Weibull lines (shape and scale in the node); a P-P plot with the 95 % DKW band.', make: weibullExample },
  { group: 'Charts: distributions', name: 'Bland–Altman: two devices', desc: 'After Bland & Altman 1986: the systolic pressure of 60 patients by two devices — the differences against the means, the bias and the limits of agreement with their exact 95 % intervals (shaded), the regression on the mean (device B reads higher in the high range), the points by site; then the differences in % with limits from a regression (Bland & Altman 1999).', make: blandAltmanExample },
  { group: 'Charts: more types', name: 'Pie, doughnut and nested rings', desc: 'The energy sources of a grid — a pie with wind and solar moved out, the names outside on leader lines and the percents inside, a doughnut sorted largest first with the total in the hole, and the two years as nested rings.', make: pieExample },
  { group: 'Charts: more types', name: 'Polar: antenna pattern, wind rose, radar', desc: 'The gain of a half-wave dipole in dB on a half circle (0° at the top, clockwise, −30 dB at the centre), a month of wind as polar bars with compass labels, and three materials scored on six properties as filled radar polygons.', make: polarExample },
  { group: 'Charts: more types', name: 'Scatter matrix of four measures, three species', desc: 'Four measures of 90 flowers (in the manner of Fisher’s iris data) — every pair as points coloured by species below the diagonal, the kernel densities on it, the Pearson correlations (with stars) above; X shared down the columns, Y along the rows.', make: scatterMatrixExample },
  { group: 'Charts: more types', name: 'Ternary: soil texture, a diffusion path', desc: 'The soil texture triangle: the clay, sand and silt of 45 samples from three sites (percents, coloured by site), and the Fe–Ni–Cr composition along a diffusion couple as a line with symbols (fractions, a grid every 0.2).', make: ternaryExample },
  { group: 'Charts: more types', name: 'Waterfall: reflectance vs thickness, a PL ridgeline', desc: 'The reflectance of a microcavity for 23 thicknesses (Split into columns gives every curve its thickness) one behind the other, the front curves hiding those behind, coloured by the thickness with a colour bar and the thickness written at each; and a ridgeline of photoluminescence spectra from 10 to 300 K, each to its maximum, filled in its colour.', make: curvesWaterfallExample },
];

// the examples as opened: every one with its note
// the groups, in the order the menus show them (the examples of a group in the order of LIST)
const GROUPS = ['Getting started', 'Data preparation', 'Figures & layout', 'Charts: bars', 'Charts: box & violin', 'Charts: distributions', 'Charts: more types', 'Statistics', 'Fitting', 'Spectroscopy & optics', 'Signals', 'Electrochemistry & impedance', 'Images', 'Phase diagrams', 'Matrices & 3D'];
const rank = (g: string) => (GROUPS.includes(g) ? GROUPS.indexOf(g) : GROUPS.length);
export const EXAMPLES = LIST.map((e, i) => ({ e, i }))
  .sort((a, b) => rank(a.e.group) - rank(b.e.group) || a.i - b.i)
  .map(({ e }) => ({ ...e, make: () => withAbout(e.make(), e.name) }));

