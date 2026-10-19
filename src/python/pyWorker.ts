// Python for the Python scripts: Pyodide (CPython built for the browser, MPL-2.0; https://pyodide.org) loaded in this worker
// from the jsDelivr CDN the first time a script runs, then kept by the browser's cache; the packages the code imports
// (numpy, scipy, pandas, matplotlib, statsmodels, scikit-learn …) loaded when first imported. One run at a time; Stop
// ends the worker (a new one is made for the next run).
import { RUNTIME } from './runtime.ts';
import type { MplCurve, MplFigure, PyJob, PyOut, PyResult, PyValue } from '../engine/python.ts';

import { PYODIDE_VERSION } from './version.ts';
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export type PyRequest = { id: string; job: PyJob };
export type PyReply = { type: 'status'; text: string } | { type: 'done'; id: string; result: PyResult };

// what is used of Pyodide's interface
type PyProxy = { toJs(o: { dict_converter: (e: Iterable<[string, unknown]>) => unknown; create_pyproxies: boolean }): unknown; destroy(): void };
type Pyodide = {
  runPython(code: string): unknown;
  loadPackage(names: string[], o?: { messageCallback?: (m: string) => void; errorCallback?: (m: string) => void }): Promise<unknown>;
  loadPackagesFromImports(code: string, o?: { messageCallback?: (m: string) => void; errorCallback?: (m: string) => void }): Promise<unknown>;
  globals: { get(name: string): (...a: unknown[]) => PyProxy };
  toPy(v: unknown): unknown;
};

const status = (text: string) => self.postMessage({ type: 'status', text } satisfies PyReply);

let ready: Promise<Pyodide> | null = null;
function python(): Promise<Pyodide> {
  if (!ready)
    ready = (async () => {
      status('Loading Python (the first time: about 10 MB)…');
      const mod = (await import(/* @vite-ignore */ `${CDN}pyodide.mjs`)) as { loadPyodide: (o: { indexURL: string }) => Promise<Pyodide> };
      const py = await mod.loadPyodide({ indexURL: CDN });
      status('Loading numpy…');
      await py.loadPackage(['numpy']);
      py.runPython(RUNTIME);
      return py;
    })();
  return ready;
}

// a value posted to Python: its numbers as the bytes of float64 (read there by numpy without a copy per element)
const bytes = (a: Float64Array) => new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
function plainValue(v: PyValue): unknown {
  const col = (c: { name: string; values: Float64Array; text?: string[]; role?: string }) => ({ name: c.name, values: bytes(c.values), ...(c.text ? { text: c.text } : {}), ...(c.role ? { role: c.role } : {}) });
  if (v.kind === 'column') return { kind: 'column', col: col(v.col) };
  if (v.kind === 'value') return v;
  if (v.kind === 'matrix') return { ...v, v: bytes(v.v) };
  if (v.kind === 'dataset') return { kind: 'dataset', name: v.name, columns: v.columns.map(col) };
  return { kind: 'workbook', name: v.name, sheets: v.sheets.map((s) => ({ name: s.name, columns: s.columns.map(col) })) };
}
// the bytes of float64 back as numbers
const floats = (b: unknown) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(0);
  const out = new Float64Array(u.byteLength / 8);
  new Uint8Array(out.buffer).set(u.subarray(0, out.length * 8));
  return out;
};
type RawCol = { name: string; values: Uint8Array; text?: string[]; role?: string };
const colBack = (c: RawCol) => ({ name: c.name, values: floats(c.values), ...(c.text ? { text: c.text } : {}), ...(c.role ? { role: c.role as never } : {}) });
const MIME: Record<string, string> = { svg: 'image/svg+xml', png: 'image/png', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', tif: 'image/tiff', tiff: 'image/tiff', eps: 'application/postscript', ps: 'application/postscript', csv: 'text/csv', txt: 'text/plain', json: 'application/json' };

self.onmessage = async (e: MessageEvent<PyRequest>) => {
  const { id, job } = e.data;
  const t0 = performance.now();
  const fail = (message: string): PyResult => ({ key: job.key, run: job.run, outputs: [], skipped: [], console: '', error: { message }, figures: [], files: [], ms: Math.round(performance.now() - t0) });
  let result: PyResult;
  try {
    const py = await python();
    // the packages the code imports (and pandas for a table's .df)
    const note = (m: string) => /^Loading|^Loaded/.test(m) && status(m.replace(/^Loading /, 'Loading ').slice(0, 120));
    await py.loadPackagesFromImports(job.code, { messageCallback: note, errorCallback: () => undefined });
    if (/\.df\b|pandas/.test(job.code)) await py.loadPackage(['pandas'], { messageCallback: note });
    status('Running…');
    const run = py.globals.get('_run');
    const inputs = py.toPy(job.vars.map((v) => ({ name: v.name, value: plainValue(v.value) })));
    const out = run(job.code, inputs);
    const raw = out.toJs({ dict_converter: Object.fromEntries, create_pyproxies: false }) as {
      outputs: { name: string; kind: PyOut['kind']; value?: number; col?: RawCol; columns?: RawCol[]; rows?: number; cols?: number; v?: Uint8Array }[];
      skipped: PyResult['skipped'];
      console: string;
      display?: PyResult['display'];
      error?: PyResult['error'];
      figures: PyResult['figures'];
      files: { name: string; bytes: Uint8Array }[];
      ms: number;
    };
    out.destroy();
    (inputs as { destroy?: () => void }).destroy?.();
    const outputs = raw.outputs.map((o): PyOut => (o.kind === 'column' ? { name: o.name, kind: 'column', col: colBack(o.col!) } : o.kind === 'dataset' ? { name: o.name, kind: 'dataset', columns: o.columns!.map(colBack) } : o.kind === 'matrix' ? { name: o.name, kind: 'matrix', rows: o.rows ?? 0, cols: o.cols ?? 0, v: floats(o.v) } : { name: o.name, kind: 'value', value: o.value ?? NaN }));
    const files = raw.files.map((f) => ({ name: f.name, mime: MIME[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream', bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(0) }));
    // the data of the figures read (Make Plot): numbers
    const ARRAYS = new Set(['x', 'y', 'yerr', 'ylo', 'xerr']);
    const curveBack = (c: Record<string, unknown>) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, ARRAYS.has(k) ? floats(v) : v]));
    const figures = raw.figures.map((f) => {
      if (!f.desc) return f;
      const d = f.desc as unknown as MplFigure;
      const axes = d.axes.map((a) => ({ ...a, curves: a.curves.map((c) => curveBack(c as unknown as Record<string, unknown>) as unknown as MplCurve) }));
      return { ...f, desc: { ...d, axes } };
    });
    result = { key: job.key, run: job.run, outputs, skipped: raw.skipped, console: raw.console, ...(raw.display ? { display: raw.display } : {}), ...(raw.error ? { error: raw.error } : {}), figures, files, ms: raw.ms };
  } catch (err) {
    result = fail(`Python could not run: ${(err as Error).message ?? err}`);
    // Python not loaded (no network …): tried again at the next run
    if (!(await ready?.then(() => true, () => false))) ready = null;
  }
  self.postMessage({ type: 'done', id, result } satisfies PyReply);
};
