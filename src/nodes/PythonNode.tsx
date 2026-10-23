// Python script: inputs A, B, C … (one free after the last used), the code (its editor), Run / Stop and what Python is
// doing, the printed text and the last expression (a table for a DataFrame), an error with its line, the figures of
// matplotlib and the files the code saved (to download), the outputs (one port per variable made, by its kind). In the
// panel: run by itself or on Run, the inputs' names, the outputs given (ticked), examples.
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import { figPort, portKindOf, validName, type PyOut } from '../engine/python.ts';
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

const KIND_TEXT: Record<string, string> = { column: 'array', value: 'float', dataset: 'Table', matrix: '2D array', workbook: 'dict of Tables' };
const outText = (o: PyOut) => (o.kind === 'value' ? (Number.isFinite(o.value) ? String(+o.value.toPrecision(6)) : 'NaN') : o.kind === 'column' ? `column, ${o.col.values.length} rows` : o.kind === 'dataset' ? `table, ${o.columns[0]?.values.length ?? 0} × ${o.columns.length}` : `matrix ${o.rows} × ${o.cols}`);

// starts to choose from: they replace the code
const EXAMPLES: [string, string][] = [
  ['Fit a curve (scipy curve_fit)', `from scipy.optimize import curve_fit

# A: x, B: y (connect two columns)
def model(x, a, tau, y0):
    return a * np.exp(-x / tau) + y0

p, cov = curve_fit(model, A, B, p0=[1, 1, 0])
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
  ['Groups compared (scipy stats, statsmodels)', `from scipy import stats

# A, B, C: three groups (columns)
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
params = model.make_params(g_amplitude=B.max(), g_center=A[B.argmax()], g_sigma=(A.max() - A.min()) / 20, b_slope=0, b_intercept=B.min())
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
img = np.asarray(A, dtype=float)
img = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
_, mask = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
n, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
areas = stats[1:, cv2.CC_STAT_AREA]
print(f"{n - 1} blobs, mean area {areas.mean():.1f} px")
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
          <InPort key={k} label={letter} port="any" id={`in-${k}`} title={`Optional: a column, a value, a dataset, a matrix or a workbook — in the code the variable ${data.vars?.[letter] || letter}`}>
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
          <div className="col-form">
            {py.vars.map((v) => (
              <VarName key={v.letter} letter={v.letter} value={data.vars?.[v.letter] ?? ''} onChange={(nm) => set({ vars: { ...data.vars, [v.letter]: nm || undefined } as Record<string, string> })} />
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
