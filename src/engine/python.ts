// Python script: what goes to Python and what comes back, pure (the running itself is in src/python, Pyodide in a worker
// of its own). Every input port (A, B, C …) is a variable — a column a numpy array, a value a float, a dataset a table
// (its columns by name, its designations; .df a pandas DataFrame), a matrix a 2D array, a workbook a dict of tables; the
// variables the code makes are the outputs, each by its kind (a number, a column, a matrix, a dataset). A run is asked
// for when the code or the data change (their digest), its result kept by the engine and given back here. A node's code
// is also a module (its “module” output): on an input of another node it is that module, its functions used there.
import type { Column, ColumnRole, Dataset, Scalar, Workbook } from './table.ts';
import type { Matrix } from './matrix.ts';

// a value as Python gets it (posted to the worker: plain arrays)
export type PyCol = { name: string; values: Float64Array; text?: string[]; role?: ColumnRole };
export type PyValue = { kind: 'column'; col: PyCol } | { kind: 'value'; name: string; value: number } | { kind: 'dataset'; name: string; columns: PyCol[] } | { kind: 'matrix'; name: string; rows: number; cols: number; v: Float64Array } | { kind: 'workbook'; name: string; sheets: { name: string; columns: PyCol[] }[] } | { kind: 'module'; name: string; mod: PyModule };
// A Python node's code as a module: its code, and its own inputs (data, other modules) by their names there — the module
// made from them where it is used (`lib.fit(x)`, `from lib import fit`), its code run again at every run of that node
export type PyModule = { node: string; code: string; vars: { name: string; value: PyValue }[] };
// a variable of the code given out, by its kind
export type PyOut = { name: string; kind: 'value'; value: number } | { name: string; kind: 'column'; col: PyCol } | { name: string; kind: 'dataset'; columns: PyCol[] } | { name: string; kind: 'matrix'; rows: number; cols: number; v: Float64Array };
// A figure of matplotlib as read for “Make Plot”: its size (in), text size (pt), grid of axes; every axes its titles,
// limits (null: automatic), scales, curves (their data and look; on the left or the right axis — twinx), lines across
// (axhline / axvline), texts, legend; what could not be read
export type MplCurve = {
  label: string;
  x: Float64Array;
  y: Float64Array;
  yerr?: Float64Array;
  ylo?: Float64Array;
  xerr?: Float64Array;
  mode: 'line' | 'scatter' | 'linesymbol' | 'step';
  step?: 'hv' | 'vh' | 'mid';
  axis: 'y' | 'y2';
  color: string;
  lw?: number;
  dash?: string;
  alpha?: number;
  marker?: string;
  ms?: number;
  open?: boolean;
  mec?: string;
  mew?: number;
  errColor?: string;
  errWidth?: number;
  errCap?: number;
  hidden?: boolean;
  fillTo?: number;
  fillAlpha?: number;
};
export type MplAxes = {
  title: string;
  xlabel: string;
  ylabel: string;
  y2label?: string;
  xlim: [number, number] | null;
  ylim: [number, number] | null;
  y2lim?: [number, number] | null;
  xscale: string;
  yscale: string;
  y2scale?: string;
  grid: boolean;
  row?: number;
  col?: number;
  labelSize?: number;
  tickSize?: number | null;
  curves: MplCurve[];
  lines: { kind: 'hline' | 'vline'; v: number; color: string; width: number; dash: string }[];
  texts: { text: string; x: number; y: number; coords: 'data' | 'axes'; size: number; color: string; ha: string; va: string }[];
  legend: { show: boolean; loc: string; frame: boolean } | null;
};
export type MplFigure = { w: number; h: number; size: number; rows: number; cols: number; axes: MplAxes[]; skipped: string[] };
// what the node shows of a figure made by matplotlib (its picture; read for Make Plot), and a file the code saved
export type PyFigure = { num: number; svg: string; desc?: MplFigure };
export type PyFile = { name: string; mime: string; bytes: Uint8Array };
// the last expression shown as Jupyter does: a text, or a table (its first rows)
export type PyDisplay = { text: string } | { table: { columns: string[]; rows: string[][]; total: number } };
// a run: what it was asked with (its digest, the Run count), its outputs, its printed text, an error (its line in the
// code), its figures and files, how long it took
// packages: the libraries loaded in Python after it (their names as installed, their versions)
export type PyResult = { key: string; run: number; outputs: PyOut[]; skipped: { name: string; type: string }[]; console: string; display?: PyDisplay; error?: { message: string; line?: number }; figures: PyFigure[]; files: PyFile[]; ms: number; packages?: Record<string, string> };

// The libraries a script can import: the name imported, installed (dist), shown; from Pyodide's own set, or from PyPI
// (pure Python, installed by micropip the first time: pypi, the name to install)
export type PyLibrary = { imp: string; dist: string; label: string; what: string; pypi?: string };
export const PY_LIBRARIES: PyLibrary[] = [
  { imp: 'numpy', dist: 'numpy', label: 'NumPy', what: 'arrays, linear algebra, FFT, random numbers' },
  { imp: 'scipy', dist: 'scipy', label: 'SciPy', what: 'fitting, optimization, signal, integration, statistics' },
  { imp: 'pandas', dist: 'pandas', label: 'pandas', what: 'tables (DataFrame): grouping, joining, reshaping' },
  { imp: 'matplotlib', dist: 'matplotlib', label: 'Matplotlib', what: 'figures (drawn under the node, Make Plot)' },
  { imp: 'statsmodels', dist: 'statsmodels', label: 'statsmodels', what: 'regression, ANOVA, time series' },
  { imp: 'sklearn', dist: 'scikit-learn', label: 'scikit-learn', what: 'machine learning: clustering, classification, PCA' },
  { imp: 'skimage', dist: 'scikit-image', label: 'scikit-image', what: 'image processing' },
  { imp: 'cv2', dist: 'opencv-python', label: 'OpenCV', what: 'images and video, computer vision' },
  { imp: 'sympy', dist: 'sympy', label: 'SymPy', what: 'symbolic mathematics' },
  { imp: 'lmfit', dist: 'lmfit', label: 'lmfit', what: 'curve fitting with parameters and bounds', pypi: 'lmfit' },
  { imp: 'seaborn', dist: 'seaborn', label: 'seaborn', what: 'statistical plots', pypi: 'seaborn' },
  { imp: 'pingouin', dist: 'pingouin', label: 'Pingouin', what: 'statistical tests', pypi: 'pingouin' },
  { imp: 'pybaselines', dist: 'pybaselines', label: 'pybaselines', what: 'baseline correction', pypi: 'pybaselines' },
  { imp: 'emcee', dist: 'emcee', label: 'emcee', what: 'MCMC sampling', pypi: 'emcee' },
  { imp: 'pint', dist: 'pint', label: 'Pint', what: 'physical units', pypi: 'pint' },
  { imp: 'tifffile', dist: 'tifffile', label: 'tifffile', what: 'TIFF images', pypi: 'tifffile' },
  { imp: 'openpyxl', dist: 'openpyxl', label: 'openpyxl', what: 'Excel files', pypi: 'openpyxl' },
];
// The codes run by a job: its own and those of the modules on its inputs (and theirs): what is imported in any of them
export function codesOf(code: string, vars: PyJob['vars']): string[] {
  const out = [code];
  for (const v of vars) if (v.value.kind === 'module') out.push(...codesOf(v.value.mod.code, v.value.mod.vars));
  return out;
}
// a run asked for: the node, the digest, the code, the variables
export type PyJob = { key: string; run: number; code: string; vars: { name: string; value: PyValue }[] };

export type PortKind = 'column' | 'scalar' | 'dataset' | 'matrix';
export const portKindOf = (o: Pick<PyOut, 'kind'>): PortKind => (o.kind === 'value' ? 'scalar' : o.kind);

// a Python name: letters, digits and _ (not a digit first, not a keyword)
const KEYWORDS = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
export const validName = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !KEYWORDS.has(s);

const pyCol = (c: Column): PyCol => ({ name: c.name, values: c.values, ...(c.text ? { text: c.text } : {}), ...(c.role ? { role: c.role } : {}) });
const pySet = (d: Dataset) => d.columns.map(pyCol);
export function toPy(v: { t: 'column'; v: Column } | { t: 'scalar'; v: Scalar } | { t: 'dataset'; v: Dataset } | { t: 'matrix'; v: Matrix } | { t: 'workbook'; v: Workbook } | { t: 'module'; v: PyModule }): PyValue {
  if (v.t === 'module') return { kind: 'module', name: v.v.node, mod: v.v };
  if (v.t === 'column') return { kind: 'column', col: pyCol(v.v) };
  if (v.t === 'scalar') return { kind: 'value', name: v.v.name, value: v.v.value };
  if (v.t === 'dataset') return { kind: 'dataset', name: v.v.name, columns: pySet(v.v) };
  if (v.t === 'matrix') return { kind: 'matrix', name: v.v.name, rows: v.v.rows, cols: v.v.cols, v: v.v.v };
  return { kind: 'workbook', name: v.v.name, sheets: v.v.sheets.map((s) => ({ name: s.name, columns: pySet(s) })) };
}

// A digest of the code and the variables (FNV-1a over their names, numbers and texts): a run is asked for when it changes.
export function digest(code: string, vars: PyJob['vars'], run: number): string {
  let h = 0x811c9dc5;
  const byte = (b: number) => {
    h ^= b & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      byte(c);
      byte(c >> 8);
    }
    byte(0);
  };
  const nums = (a: Float64Array) => {
    const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < b.length; i++) byte(b[i]);
    byte(1);
  };
  const col = (c: PyCol) => {
    str(c.name);
    str(c.role ?? '');
    nums(c.values);
    if (c.text) for (const t of c.text) str(t);
  };
  str(code);
  str(String(run));
  for (const { name, value: v } of vars) {
    str(name);
    str(v.kind);
    if (v.kind === 'column') col(v.col);
    else if (v.kind === 'value') nums(Float64Array.of(v.value));
    else if (v.kind === 'dataset') v.columns.forEach(col);
    else if (v.kind === 'matrix') {
      str(`${v.rows}x${v.cols}`);
      nums(v.v);
    } else if (v.kind === 'module') str(digest(v.mod.code, v.mod.vars, 0));
    else
      for (const s of v.sheets) {
        str(s.name);
        s.columns.forEach(col);
      }
  }
  return (h >>> 0).toString(36) + code.length.toString(36);
}

// The data of a figure's axes given out (after Make Plot): a table, the columns of every curve (“label x”, “label y”,
// “label ±y” …), the names kept apart; the port's name: fig<num> (one axes) or fig<num>_<k>
export const figPort = (num: number, k: number, count: number) => (count > 1 ? `fig${num}_${k + 1}` : `fig${num}`);
export function curveColumns(ax: MplAxes): { cols: { name: string; values: Float64Array }[]; names: { x: string; y: string; yerr?: string; ylo?: string; xerr?: string }[] } {
  const used = new Set<string>();
  const uniq = (s: string) => {
    let n = s;
    for (let k = 2; used.has(n); k++) n = `${s} (${k})`;
    used.add(n);
    return n;
  };
  const cols: { name: string; values: Float64Array }[] = [];
  const names = ax.curves.map((c, i) => {
    const base = c.label || (c.hidden ? `fill ${i + 1} under` : `curve ${i + 1}`);
    const add = (suffix: string, v: Float64Array) => {
      const name = uniq(`${base} ${suffix}`);
      cols.push({ name, values: v });
      return name;
    };
    return { x: add('x', c.x), y: add('y', c.y), ...(c.yerr ? { yerr: add('±y', c.yerr) } : {}), ...(c.ylo ? { ylo: add('−y', c.ylo) } : {}), ...(c.xerr ? { xerr: add('±x', c.xerr) } : {}) };
  });
  return { cols, names };
}

// an output of the code as a value of the graph
export function outValue(o: PyOut): { t: 'column'; v: Column } | { t: 'scalar'; v: Scalar } | { t: 'dataset'; v: Dataset } | { t: 'matrix'; v: Matrix } {
  const col = (c: PyCol): Column => ({ name: c.name, values: c.values, ...(c.text ? { text: c.text } : {}), ...(c.role ? { role: c.role } : {}) });
  if (o.kind === 'value') return { t: 'scalar', v: { name: o.name, value: o.value } };
  if (o.kind === 'column') return { t: 'column', v: col({ ...o.col, name: o.col.name || o.name }) };
  if (o.kind === 'dataset') return { t: 'dataset', v: { name: o.name, columns: o.columns.map(col) } };
  return { t: 'matrix', v: { name: o.name, rows: o.rows, cols: o.cols, v: o.v } };
}
