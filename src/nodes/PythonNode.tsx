// Python script: inputs A, B, C … (one free after the last used), the code (its editor), Run / Stop and what Python is
// doing, the printed text and the last expression (a table for a DataFrame), an error with its line, the figures of
// matplotlib and the files the code saved (to download), the outputs (one port per variable made, by its kind), and its
// code as a module (for other scripts). In the panel: run by itself or on Run, the inputs (their names, what each is in
// Python and how it is used), the outputs given (ticked), the libraries (loaded or not; a click imports one), examples.
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import { figPort, portKindOf, PY_LIBRARIES, validName, type PyOut, type PyValue } from '../engine/python.ts';
import { figureNodes } from '../mplPlot.ts';
import { maxOf } from '../engine/minmax.ts';
import { allowProject, stopPython, usePython } from '../python/runner.ts';
import { PYODIDE_VERSION } from '../python/version.ts';
import type { AppNode, PythonData, PythonNode } from '../types.ts';
import { NodeOptions } from './NodeOptions.tsx';
import { Check, InPort, Messages, OutPort, TextInput } from './ui.tsx';
import { Maximize2, Play, Square, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ask } from '../ui/dialogStore.ts';

const CodeEditor = lazy(() => import('./CodeEditor.tsx'));

const KIND_TEXT: Record<string, string> = { column: 'array', value: 'float', dataset: 'Table', matrix: '2D array', workbook: 'dict of Tables', module: 'module' };
// what an input is in Python, and a line that uses it (its name in the code)
const PY_TYPE: Record<PyValue['kind'], [string, (n: string) => string]> = {
  column: ['a column: a numpy array (text: an array of str)', (n) => `np.mean(${n})`],
  value: ['one value: a float', (n) => `${n} * 2`],
  dataset: ['a table: a Table (its columns by name; .df a pandas DataFrame)', (n) => `${n}.df.head()`],
  matrix: ['a matrix: a 2D numpy array', (n) => `${n}.shape`],
  workbook: ['a workbook: a dict of Tables, by sheet name', (n) => `list(${n})`],
  module: ['a module: the code of another script (its functions)', (n) => `${n}.my_function(…)  ·  from ${n} import my_function`],
};
// the line a library is imported with (else “import <name>”)
const IMPORT_LINE: Record<string, string> = { numpy: 'import numpy as np', pandas: 'import pandas as pd', matplotlib: 'import matplotlib.pyplot as plt', seaborn: 'import seaborn as sns' };
const outText = (o: PyOut) => (o.kind === 'value' ? (Number.isFinite(o.value) ? String(+o.value.toPrecision(6)) : 'NaN') : o.kind === 'column' ? `column, ${o.col.values.length} rows` : o.kind === 'dataset' ? `table, ${o.columns[0]?.values.length ?? 0} × ${o.columns.length}` : `matrix ${o.rows} × ${o.cols}`);

// starts to choose from: they replace the code
const EXAMPLES: [string, string][] = [
  ['Fit a curve (scipy curve_fit)', `from scipy.optimize import curve_fit

# A: x, B: y (connect two columns)
def model(x, a, tau, y0):
    return a * np.exp(-x / tau) + y0

# (the points with both values; names starting with _ are not outputs)
_ok = np.isfinite(A) & np.isfinite(B)
_x, _y = A[_ok], B[_ok]
# (starts from the data: the drop, a third of the range, the end)
p, cov = curve_fit(model, _x, _y, p0=[_y[0] - _y[-1], (_x.max() - _x.min()) / 3, _y[-1]])
err = np.sqrt(np.diag(cov))
tau = p[1]
fit = model(A, *p)
print(f"tau = {p[1]:.4g} ± {err[1]:.2g}")
`],
  ['A table with pandas (rename, new column, statistics)', `# A: a dataset
df = A.df
df = df.rename(columns={df.columns[1]: "Signal (a.u.)"})
df["Normalized"] = df["Signal (a.u.)"] / df["Signal (a.u.)"].max()
roles(df, x=df.columns[0], y=["Signal (a.u.)", "Normalized"])
df.describe()
`],
  ['Groups compared (scipy.stats: one-way ANOVA, Dunnett against a control)', `from scipy import stats

# A, B, C: three groups (columns); A the control
A, B, C = (g[np.isfinite(g)] for g in (A, B, C))
F, p = stats.f_oneway(A, B, C)
print(f"one-way ANOVA: F = {F:.4g}, p = {p:.3g}")
res = stats.dunnett(B, C, control=A)
print(res)
`],
  ['A figure with matplotlib (saved as SVG and PNG)', `import matplotlib.pyplot as plt

x = np.linspace(0, 10, 200)
fig, ax = plt.subplots(figsize=(3.3, 2.5))
ax.plot(x, np.sin(x), label="sin")
ax.plot(x, np.cos(x), "--", label="cos")
ax.set_xlabel("x")
ax.set_ylabel("y")
ax.legend()
fig.tight_layout()
fig.savefig("figure.svg", transparent=True)
fig.savefig("figure.png", dpi=300, transparent=True)
`],
  ['A fit with lmfit (a peak and a baseline, its report)', `from lmfit.models import GaussianModel, LinearModel

# A: x, B: y (connect two columns)
model = GaussianModel(prefix="g_") + LinearModel(prefix="b_")
sigma = (A.max() - A.min()) / 20
# (lmfit's amplitude is the peak's area: its height × sigma × √(2π))
params = model.make_params(g_amplitude=(B.max() - B.min()) * sigma * np.sqrt(2 * np.pi), g_center=A[B.argmax()], g_sigma=sigma, b_slope=0, b_intercept=B.min())
result = model.fit(B, params, x=A)
print(result.fit_report())
fit = result.best_fit
center = result.params["g_center"].value
`],
  ['Machine learning (scikit-learn: a random forest, cross-validated)', `from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score

# A: a dataset, its last column the target, the others the features
df = A.df
X, y = df.iloc[:, :-1].values, df.iloc[:, -1].values
model = RandomForestRegressor(n_estimators=200, random_state=0)
scores = cross_val_score(model, X, y, cv=5, scoring="r2")
print(f"R² (5-fold): {scores.mean():.3f} ± {scores.std():.3f}")
model.fit(X, y)
importance = model.feature_importances_
`],
  ['An image with OpenCV (blobs found, their areas)', `import cv2

# A: a matrix (an image from Image analysis, or any 2D array)
img = np.nan_to_num(np.asarray(A, dtype=float))
img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
_, mask = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
areas = stats[1:, cv2.CC_STAT_AREA].astype(float)
print(f"{n - 1} blobs, mean area {areas.mean() if len(areas) else 0:.1f} px")
`],
  ['Statistics with pingouin (ANOVA, post-hoc, effect sizes)', `import pingouin as pg

# A: a dataset with a value column and a group column (indexed)
df = A.df
value, group = df.columns[1], df.columns[0]
aov = pg.anova(data=df, dv=value, between=group, detailed=True)
posthoc = pg.pairwise_tukey(data=df, dv=value, between=group)
print(aov)
posthoc
`],
  ['Spectrum and a low-pass filter (FFT, scipy.signal)', `from scipy import signal

# A: time (s), B: the signal (connect two columns; the time evenly spaced)
dt = float(np.median(np.diff(A)))
fs = 1 / dt
# the spectrum: one-sided amplitude
freq = np.fft.rfftfreq(len(B), dt)
amplitude = np.abs(np.fft.rfft(B - B.mean())) * 2 / len(B)
# a low-pass filter (Butterworth, 4th order), run forward and back: no shift
cutoff = 0.1 * fs / 2  # Hz: change it
_b, _a = signal.butter(4, cutoff, fs=fs)
filtered = signal.filtfilt(_b, _a, B)
print(f"fs = {fs:.4g} Hz; strongest at {freq[amplitude.argmax()]:.4g} Hz")
`],
  ['Peaks found and measured (scipy.signal: position, height, FWHM)', `import pandas as pd
from scipy.signal import find_peaks, peak_widths

# A: x, B: y (connect two columns)
prominence = 0.1 * (B.max() - B.min())  # how much a peak stands out: change it
_i, _ = find_peaks(B, prominence=prominence)
_w, _h, _left, _right = peak_widths(B, _i, rel_height=0.5)
# (the half-height crossings read on X: X need not be evenly spaced)
_rows = np.arange(len(A))
peaks = pd.DataFrame({"x": A[_i], "height": B[_i], "FWHM": np.interp(_right, _rows, A) - np.interp(_left, _rows, A)})
print(peaks)
`],
  ['A smoothing spline and its derivative (scipy.interpolate)', `from scipy.interpolate import make_smoothing_spline

# A: x, B: y (connect two columns); the smoothness found by itself (GCV)
_ok = np.isfinite(A) & np.isfinite(B)
_o = np.argsort(A[_ok])
x, y = A[_ok][_o], B[_ok][_o]
_spline = make_smoothing_spline(x, y)
smooth = _spline(x)
slope = _spline.derivative()(x)
`],
  ['A straight line with statsmodels (coefficients, confidence band)', `import statsmodels.api as sm

# A: x, B: y (connect two columns)
_X = sm.add_constant(A)
_model = sm.OLS(B, _X, missing="drop").fit()
print(_model.summary())
intercept, slope = _model.params
r2 = _model.rsquared
# the line and its 95 % confidence band, at every x
_band = _model.get_prediction(_X).summary_frame(alpha=0.05)
fit = _band["mean"].values
lower = _band["mean_ci_lower"].values
upper = _band["mean_ci_upper"].values
`],
  ['PCA of a table (scikit-learn: scores, loadings, variance explained)', `import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

# A: a table, every numeric column a variable, every row a sample
_df = A.df.select_dtypes("number").dropna()
_z = StandardScaler().fit_transform(_df.values)
_pca = PCA(n_components=min(3, _df.shape[1])).fit(_z)
_names = [f"PC{k + 1}" for k in range(_pca.n_components_)]
scores = pd.DataFrame(_pca.transform(_z), columns=_names)
loadings = pd.DataFrame(_pca.components_.T, columns=_names).assign(variable=list(_df.columns))
explained = _pca.explained_variance_ratio_ * 100
print("variance explained (%):", np.round(explained, 1))
`],
  ['Points grouped by k-means (scikit-learn: a group column for the Plot)', `import pandas as pd
from sklearn.cluster import KMeans

# A: x, B: y (connect two columns: the points)
k = 3  # the number of groups: change it
_ok = np.isfinite(A) & np.isfinite(B)
_km = KMeans(n_clusters=k, n_init=10, random_state=0).fit(np.column_stack([A[_ok], B[_ok]]))
# the group of every point (1 … k; empty where a value is missing): Plot ▸ Colours ▸ by group ▸ a column
group = np.full(len(A), np.nan)
group[_ok] = _km.labels_ + 1
centers = pd.DataFrame(_km.cluster_centers_, columns=["x", "y"])
`],
  ['Symbolic mathematics (SymPy: a derivative, an integral, then numbers)', `import sympy as sp

# nothing to connect: a formula worked out, then its values as columns
_x = sp.symbols("x")
_f = sp.exp(-_x) * sp.sin(3 * _x)
_df = sp.diff(_f, _x)
_F = sp.integrate(_f, (_x, 0, sp.oo))
print("f'(x) =", sp.simplify(_df))
print("integral from 0 to infinity =", _F, "=", float(_F))
x = np.linspace(0, 5, 200)
y = sp.lambdify(_x, _f, "numpy")(x)
dy = sp.lambdify(_x, _df, "numpy")(x)
area = float(_F)
`],
  ['A module of functions (its “module” port to another script)', `# Functions and constants only: connect this script's “module” port to an input of another script, name that input
# lib (Options ▸ Inputs), then there: lib.lorentz(x, 1, 0, 0.5), or from lib import lorentz
K_B = 8.617333e-5  # eV/K


def lorentz(x, a, x0, w):
    """A Lorentzian peak: height a, centre x0, FWHM w."""
    return a / (1 + ((np.asarray(x) - x0) / (w / 2)) ** 2)


def normalized(y):
    """y brought to 0 … 1."""
    y = np.asarray(y, dtype=float)
    return (y - np.nanmin(y)) / (np.nanmax(y) - np.nanmin(y))
`],
  ['Using a module (another script’s functions, its input named lib)', `# A: x (a column); B: the “module” port of a script of functions, named lib (Options ▸ Inputs ▸ B is called lib)
from lib import lorentz, normalized

y = lorentz(A, 1.0, float(np.nanmean(A)), (np.nanmax(A) - np.nanmin(A)) / 10)
y_norm = normalized(y)
`],
  ['Uncertainties carried through a formula (the uncertainties package)', `from uncertainties import ufloat

# nothing to connect: values with their errors; a formula of them keeps track of the error (and the correlations)
_d = ufloat(150.0, 2.0)  # thickness, nm
_n = ufloat(1.45, 0.01)  # refractive index
_lam = 2 * _n * _d  # nm: the first order of a Fabry–Pérot
_E = 1239.84 / _lam  # eV
print(f"λ = {_lam:.2uP} nm;  E = {_E:.2uP} eV")
# (as plain numbers: the outputs)
wavelength, wavelength_err = float(_lam.n), float(_lam.s)
energy, energy_err = float(_E.n), float(_E.s)
`],
];

export function PythonNodeView({ id, data }: NodeProps<PythonNode>) {
  const { updateNodeData, getNode, setNodes, setEdges } = useReactFlow<AppNode>();
  const set = (p: Partial<PythonData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const py = r?.view.py;
  const res = py?.result;
  const status = usePython();
  const running = status.running === id;
  // the ports A, B …: one free after the last one used
  const conns = useNodeConnections({ handleType: 'target' });
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, maxOf(used)) + 2);
  const byLetter = new Map((py?.vars ?? []).map((v) => [v.letter, v]));
  // the outputs as last run kept as the node's ports (their connections stay while it runs again)
  const figOuts = (res?.figures ?? []).flatMap((f) => (f.desc && data.figs?.includes(f.num) ? f.desc.axes.map((_, k) => ({ name: figPort(f.num, k, f.desc!.axes.length), kind: 'dataset' as const })) : []));
  const outs = res && !res.error ? [...res.outputs.map((o) => ({ name: o.name, kind: portKindOf(o) })), ...figOuts] : null;
  const outsKey = outs ? JSON.stringify(outs) : '';
  useEffect(() => {
    if (outs && outsKey !== JSON.stringify(data.outs ?? [])) set({ outs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outsKey]);
  const hide = new Set(data.hide ?? []);
  const ports = (data.outs ?? []).filter((o) => !hide.has(o.name));
  const run = () => {
    if (!status.allowed) allowProject();
    set({ run: (data.run ?? 0) + 1 });
  };
  const names = (py?.vars ?? []).map((v) => v.name);
  const download = (f: { name: string; mime: string; bytes: Uint8Array }) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([f.bytes as BlobPart], { type: f.mime }));
    a.download = f.name.split('/').pop() || f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const [big, setBig] = useState(false);
  // a figure of matplotlib made into Plots, beside this node, its data given out by this script
  const makePlot = (num: number) => {
    const f = res?.figures.find((q) => q.num === num);
    const me = getNode(id);
    if (!f?.desc || !me) return;
    const uid = (t: string) => `${t}-${crypto.randomUUID().slice(0, 8)}`;
    const made = figureNodes(f.desc, num, { id, x: me.position.x, y: me.position.y, w: me.measured?.width ?? 560 }, uid);
    const figs = [...new Set([...(data.figs ?? []), num])];
    const outsNow = [...(data.outs ?? []).filter((o) => !/^fig\d+(_\d+)?$/.test(o.name)), ...(res?.figures ?? []).flatMap((g) => (g.desc && figs.includes(g.num) ? g.desc.axes.map((_, k) => ({ name: figPort(g.num, k, g.desc!.axes.length), kind: 'dataset' as const })) : []))];
    set({ figs, outs: outsNow });
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...made.nodes.map((n) => ({ ...n, selected: true }))]);
    setEdges((es) => [...es, ...made.edges]);
  };
  const editor = (height: number) => (
    <Suspense fallback={<div className="code-editor muted">Loading the editor…</div>}>
      <CodeEditor value={data.code} onChange={(code) => set({ code })} onRun={run} names={names} error={res?.error?.line} height={height} />
    </Suspense>
  );
  const mixed = /^\t+ +|^ +\t/m.test(data.code);
  return (
    <div className="node node-python">
      {Array.from({ length: count }, (_, k) => {
        const letter = columnLetter(k);
        const v = byLetter.get(letter);
        return (
          <InPort key={k} label={letter} port="any" id={`in-${k}`} title={`Optional: a column, a value, a dataset, a matrix or a workbook; in the code the variable ${data.vars?.[letter] || letter}`}>
            <span className={`ellipsis${v ? '' : ' muted'}`}>{v ? `${v.name} · ${KIND_TEXT[v.kind] ?? v.kind} (${v.size})` : 'connect anything (optional)'}</span>
          </InPort>
        );
      })}
      {editor(220)}
      {mixed && <div className="msg warn">Tabs and spaces are mixed in the indentation: Python may refuse it. Select all and press Shift+Tab, then Tab, to make it spaces.</div>}
      <div className="row wrap">
        <button className="nodrag btn-run" title="Run the code (Ctrl+Enter in the editor)" onClick={run}>
          <Play {...IC} /> Run
        </button>
        {running && (
          <button className="nodrag btn-stop" title="End the run (Python starts again at the next run)" onClick={stopPython}>
            <Square {...IC} /> Stop
          </button>
        )}
        <button className="nodrag ts-btn" title="A larger editor" onClick={() => setBig(true)}>
          <Maximize2 {...IC} />
        </button>
        <span className="muted ellipsis grow">{running ? status.text || 'Running…' : res ? `${res.error ? '✗' : '✓'} ${res.ms} ms${py?.stale && data.auto !== true ? ' · changed since: press Run' : ''}` : ''}</span>
      </div>
      {!status.allowed && (
        <div className="msg warn">
          This project came from a link or a file: its Python code has not run. Run it only if you trust where it came from (Python here can read the projects kept in this browser).{' '}
          <button className="nodrag" onClick={allowProject}>
            Allow and run
          </button>
        </div>
      )}
      {res?.error && <pre className="py-error">{`${res.error.line ? `Line ${res.error.line}: ` : ''}${res.error.message}`}</pre>}
      {!!res?.console && <pre className="py-console nowheel">{res.console}</pre>}
      {res?.display && ('text' in res.display ? <pre className="py-console nowheel">{res.display.text}</pre> : <PyTable t={res.display.table} />)}
      {res?.figures.map((f) => (
        <div key={f.num} className="py-fig">
          <img className="py-figure" alt={`matplotlib figure ${f.num}`} title={`matplotlib figure ${f.num}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(f.svg)}`} />
          {f.desc && (
            <div className="row wrap">
              <button className="nodrag" title="This figure as Plots of SciPlotFlow (a Merge for several axes): their data come from this script (run again: they change), their look is set in the Plots" onClick={() => makePlot(f.num)}>
                Make Plot
              </button>
              {!!f.desc.skipped.length && <span className="muted" title={[...new Set(f.desc.skipped)].join('\n')}>not made: {[...new Set(f.desc.skipped)].join('; ')}</span>}
            </div>
          )}
        </div>
      ))}
      {!!res?.files.length && (
        <div className="row wrap">
          <span className="muted">Files the code saved:</span>
          {res.files.map((f) => (
            <button key={f.name} className="nodrag" title={`The file the code saved (${(f.bytes.length / 1024).toFixed(0)} kB)`} onClick={() => download(f)}>
              Download {f.name}
            </button>
          ))}
        </div>
      )}
      <Messages result={r} />
      {ports.map((o) => {
        const val = res?.outputs.find((q) => q.name === o.name);
        const isFig = /^fig\d+(_\d+)?$/.test(o.name) && !val;
        return (
          <OutPort key={o.name} label={o.name} port={o.kind} id={`py-${o.name}`} title={`The variable ${o.name} of the code`}>
            <span className="muted ellipsis">{val ? outText(val) : isFig ? 'the data of the figure (its Plot)' : o.kind}</span>
          </OutPort>
        );
      })}
      <OutPort label="module" port="module" id="module" title="This script's code as a module: on an input of another Python script it is that module, by the input's name there (lib.my_function(x), from lib import my_function); its own inputs go with it, its code runs again at every run there (keep it to functions and constants)">
        <span className="muted ellipsis">its code, for other scripts</span>
      </OutPort>
      {big && (
        <div className="welcome-backdrop" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
          <div className="py-big">
            <div className="row">
              <b>Python script</b>
              <span className="grow" />
              <button className="btn-run" onClick={run}>
                <Play {...IC} /> Run
              </button>
              <button onClick={() => setBig(false)} aria-label="Close"><X {...IC} /></button>
            </div>
            {editor(Math.round(window.innerHeight * 0.7))}
          </div>
        </div>
      )}
      <NodeOptions>
        <Check label="Auto run" title="Off (the default): the code runs only when you press Run (Ctrl+Enter). On: again at every change of the code or the data" value={data.auto === true} onChange={(auto) => set({ auto: auto || undefined })} />
        {!!py?.vars.length && (
          <div className="py-ins">
            <div className="muted">Inputs</div>
            {py.vars.map((v) => (
              <div key={v.letter} className="py-in">
                <div className="col-form">
                  <VarName letter={v.letter} value={data.vars?.[v.letter] ?? ''} onChange={(nm) => set({ vars: { ...data.vars, [v.letter]: nm || undefined } as Record<string, string> })} />
                </div>
                <div className="muted">
                  {PY_TYPE[v.kind][0]} · {v.size}
                </div>
                <code className="py-use" title="A line that uses it">
                  {PY_TYPE[v.kind][1](v.name)}
                </code>
              </div>
            ))}
          </div>
        )}
        {!!res?.outputs.length && (
          <div className="row wrap" title="The variables of the code given out as ports (untick those you do not want)">
            <span className="muted">Outputs</span>
            {res.outputs.map((o) => (
              <Check key={o.name} label={o.name} value={!hide.has(o.name)} onChange={(on) => set({ hide: on ? (data.hide ?? []).filter((x) => x !== o.name) : [...(data.hide ?? []), o.name] })} />
            ))}
          </div>
        )}
        <div className="row">
          <select
            className="nodrag"
            value=""
            title="A start: it replaces the code"
            onChange={(e) => {
              const ex = EXAMPLES[Number(e.target.value)];
              if (ex && !data.code.trim()) set({ code: ex[1] });
              else if (ex) void ask('Replace the code with this example?', { ok: 'Replace' }).then((yes) => yes && set({ code: ex[1] }));
            }}
          >
            <option value="">Examples…</option>
            {EXAMPLES.map(([l], k) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <details className="py-libs">
          <summary>Libraries</summary>
          {PY_LIBRARIES.map((l) => {
            const v = res?.packages?.[l.dist.toLowerCase()];
            const line = IMPORT_LINE[l.imp] ?? `import ${l.imp}`;
            return (
              <div key={l.imp} className="py-lib">
                <button
                  className="nodrag"
                  title={`“${line}” put at the top of the code`}
                  onClick={() => {
                    if (!data.code.split('\n').some((q) => q.trim() === line)) set({ code: `${line}\n${data.code}` });
                  }}
                >
                  {l.label}
                </button>
                <span className="muted ellipsis" title={l.what}>
                  {l.what}
                </span>
                <span className={v ? 'py-lib-on' : 'muted'} title={v ? 'Loaded in Python (at the last run of this script)' : l.pypi ? 'Installed from PyPI the first time a script imports it' : 'Downloaded the first time a script imports it, then kept by the browser'}>
                  {v ? `loaded ${v}` : l.pypi ? 'PyPI, at import' : 'at import'}
                </span>
              </div>
            );
          })}
        </details>
        <div className="hint">
          Python {PYODIDE_VERSION.startsWith('314') ? '3.14' : ''} in the browser (Pyodide {PYODIDE_VERSION}, MPL-2.0): nothing is installed and the data never leave this computer; the first run downloads Python (about 10 MB) and each library the code imports (numpy, scipy, pandas, matplotlib, statsmodels, scikit-learn, scikit-image, OpenCV as cv2, sympy …; lmfit, seaborn, pingouin, pybaselines, emcee, pint, tifffile and openpyxl come from PyPI the first time), then the browser keeps them.
        </div>
      </NodeOptions>
    </div>
  );
}

// an input's name in the code (a Python name)
function VarName({ letter, value, onChange }: { letter: string; value: string; onChange: (v: string) => void }) {
  const ok = !value || validName(value);
  return (
    <>
      <span title="The input's name in the code (empty: its letter)">{letter} is called</span>
      <span className="row">
        <TextInput className="short-text" value={value} placeholder={letter} onChange={onChange} />
        {!ok && <span className="err-text">not a Python name</span>}
      </span>
    </>
  );
}

function PyTable({ t }: { t: { columns: string[]; rows: string[][]; total: number } }) {
  return (
    <div className="py-table nowheel">
      <table>
        <thead>
          <tr>
            {t.columns.map((c, k) => (
              <th key={k}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, k) => (
                <td key={k}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.total > t.rows.length && <div className="muted">… {t.total} rows in all</div>}
    </div>
  );
}
