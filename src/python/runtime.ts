// The Python side of a Python script, loaded once into Pyodide: the inputs made into variables (a column a numpy array,
// a dataset a Table — its columns by name, .df a pandas DataFrame, its designations kept —, a matrix a 2D array, a
// workbook a dict of Tables), the code run (print kept; the last expression shown as Jupyter does), the variables it made
// given out by their kind, the figures of matplotlib drawn as SVG, the files it saved (savefig …), an error with its line.
export const RUNTIME = String.raw`
import sys, io, os, ast, traceback, time, math, shutil
# matplotlib's own drawing (Agg), as on a desktop: the files saved are those matplotlib makes everywhere
os.environ['MPLBACKEND'] = 'agg'
import warnings
# a warning of matplotlib 3.10 itself (the pixel size of a figure as a float, in its own savefig), not of the code
warnings.filterwarnings('ignore', message=r'The \w+ parameter as float was deprecated')
import numpy as np

_ROLES = ('x', 'y', 'z', 'xerr', 'yerr', 'label', 'none')

class Table(dict):
    """A dataset of SciPlotFlow: its columns by name (numpy arrays), their designations (roles), its name.
    T["Wavelength (nm)"] is a column; T.df the same as a pandas DataFrame."""
    def __init__(self, cols=(), roles=None, name=''):
        super().__init__(cols)
        self.roles = dict(roles or {})
        self.name = name
    @property
    def df(self):
        import pandas as pd
        d = pd.DataFrame({k: v for k, v in self.items()})
        d.attrs['roles'] = {k: r for k, r in self.roles.items() if k in d.columns}
        return d
    def __repr__(self):
        n = max((len(v) for v in self.values()), default=0)
        return 'Table %r: %d rows × %d columns (%s)' % (self.name, n, len(self), ', '.join(map(str, self.keys())))

def roles(data, **kw):
    """The designations of a table's columns (X, Y, ±Y …): roles(df, x="Time (s)", y=["A", "B"], yerr="SD")."""
    keep = data.attrs.setdefault('roles', {}) if hasattr(data, 'attrs') else data.roles
    for role, cols in kw.items():
        if role not in _ROLES:
            raise ValueError('a designation is one of ' + ', '.join(_ROLES))
        for c in ([cols] if isinstance(cols, str) else cols):
            keep[c] = role
    return data

def _col_in(c):
    v = np.frombuffer(bytes(c['values']), dtype='<f8').copy()
    t = c.get('text')
    if t is not None and np.all(np.isnan(v)):
        return np.array(list(t), dtype=object)
    return v

def _var_in(v):
    k = v['kind']
    if k == 'column':
        return _col_in(v['col'])
    if k == 'value':
        return float(v['value'])
    if k == 'matrix':
        return np.frombuffer(bytes(v['v']), dtype='<f8').copy().reshape(int(v['rows']), int(v['cols']))
    def table(name, cols):
        return Table([(c['name'], _col_in(c)) for c in cols], {c['name']: c['role'] for c in cols if c.get('role')}, name)
    if k == 'dataset':
        return table(v['name'], v['columns'])
    return {s['name']: table(s['name'], s['columns']) for s in v['sheets']}

def _col_out(name, a, role=None):
    a = np.asarray(a)
    if a.ndim != 1:
        a = a.ravel()
    out = {'name': str(name)}
    if role in _ROLES and role != 'none':
        out['role'] = role
    if a.dtype.kind in 'biuf':
        out['values'] = np.ascontiguousarray(a, dtype='<f8').tobytes()
        return out
    if a.dtype.kind == 'M':
        text = [str(x) for x in a.astype('datetime64[s]')]
        text = ['' if t == 'NaT' else t.replace('T', ' ') for t in text]
    elif a.dtype.kind == 'c':
        out['values'] = np.ascontiguousarray(a.real, dtype='<f8').tobytes()
        return out
    else:
        text = ['' if x is None or (isinstance(x, float) and math.isnan(x)) else str(x) for x in a]
    nums = np.empty(len(text))
    for i, t in enumerate(text):
        try:
            nums[i] = float(t)
        except ValueError:
            nums[i] = np.nan
    out['values'] = nums.astype('<f8').tobytes()
    if not np.all(np.isfinite(nums) | np.array([t == '' for t in text], dtype=bool)):
        out['text'] = text
    return out

def _frame_cols(d):
    import pandas as pd
    if not isinstance(d.index, pd.RangeIndex) or d.index.name is not None:
        d = d.reset_index()
    rl = d.attrs.get('roles', {}) if hasattr(d, 'attrs') else {}
    return [_col_out(c, d[c].to_numpy(), rl.get(c)) for c in d.columns]

def _out(name, v):
    """The variable as an output: (kind, value) — or None, and its type, when it is none of them."""
    if isinstance(v, bool) or isinstance(v, (int, float, np.integer, np.floating)):
        return {'name': name, 'kind': 'value', 'value': float(v)}
    pd = sys.modules.get('pandas')
    if pd is not None and isinstance(v, pd.DataFrame):
        return {'name': name, 'kind': 'dataset', 'columns': _frame_cols(v)}
    if pd is not None and isinstance(v, pd.Series):
        return {'name': name, 'kind': 'column', 'col': _col_out(v.name if v.name is not None else name, v.to_numpy())}
    if isinstance(v, Table):
        return {'name': name, 'kind': 'dataset', 'columns': [_col_out(k, c, v.roles.get(k)) for k, c in v.items()]}
    if isinstance(v, np.ndarray):
        if v.ndim == 0:
            return {'name': name, 'kind': 'value', 'value': float(v)}
        if v.ndim == 1:
            return {'name': name, 'kind': 'column', 'col': _col_out(name, v)}
        if v.ndim == 2 and v.dtype.kind in 'biuf':
            return {'name': name, 'kind': 'matrix', 'rows': v.shape[0], 'cols': v.shape[1], 'v': np.ascontiguousarray(v, dtype='<f8').tobytes()}
        return None
    if isinstance(v, dict) and v and all(isinstance(k, str) for k in v):
        cols = list(v.values())
        if all(isinstance(c, (list, tuple, np.ndarray)) or (pd is not None and isinstance(c, pd.Series)) for c in cols):
            n = {len(c) for c in cols}
            if len(n) == 1:
                return {'name': name, 'kind': 'dataset', 'columns': [_col_out(k, np.asarray(c)) for k, c in v.items()]}
        return None
    if isinstance(v, (list, tuple)) and v and all(isinstance(x, (int, float, np.integer, np.floating, str)) for x in v):
        return {'name': name, 'kind': 'column', 'col': _col_out(name, np.asarray(v))}
    return None

def _display(v):
    if v is None:
        return None
    pd = sys.modules.get('pandas')
    rows = None
    if pd is not None and isinstance(v, pd.Series):
        v = v.to_frame()
    if isinstance(v, Table):
        if pd is None:
            return {'text': repr(v)}
        v = v.df
    if pd is not None and isinstance(v, pd.DataFrame):
        head = v.head(30)
        show = head if isinstance(head.index, pd.RangeIndex) and head.index.name is None else head.reset_index()
        cols = [str(c) for c in show.columns]
        rows = [[_cell(x) for x in r] for r in show.itertuples(index=False)]
        return {'table': {'columns': cols, 'rows': rows, 'total': int(len(v))}}
    text = repr(v)
    return {'text': text[:20000]}

def _cell(x):
    if isinstance(x, float):
        return '' if math.isnan(x) else ('%.6g' % x)
    return str(x)

# ---- a figure of matplotlib read for “Make Plot”: its axes, curves (their data and look), texts, legend ----
_MARK = {'o': 'circle', '.': 'circle', ',': 'circle', 's': 'square', '^': 'triangle', 'v': 'triangleDown', '<': 'triangleLeft', '>': 'triangleRight', 'D': 'diamond', 'd': 'diamond', 'p': 'pentagon', 'h': 'hexagon', 'H': 'hexagon', 'x': 'cross', 'X': 'cross', '+': 'plus', 'P': 'plus', '*': 'star'}
_DASH = {'-': 'solid', 'solid': 'solid', '--': 'dash', 'dashed': 'dash', ':': 'dot', 'dotted': 'dot', '-.': 'dashdot', 'dashdot': 'dashdot'}
_LOC = {1: 'tr', 2: 'tl', 3: 'bl', 4: 'br', 5: 'cr', 6: 'cl', 7: 'cr', 8: 'bc', 9: 'tc', 10: 'c'}

def _hex(c):
    from matplotlib.colors import to_hex
    try:
        return to_hex(c, keep_alpha=False)
    except Exception:
        return '#000000'

def _alpha_of(c):
    from matplotlib.colors import to_rgba
    try:
        return float(to_rgba(c)[3])
    except Exception:
        return 1.0

def _b(a):
    return np.ascontiguousarray(np.asarray(a, dtype=float).ravel(), dtype='<f8').tobytes()

def _nums(a):
    a = np.asarray(a)
    if a.dtype.kind in 'biuf':
        return a.astype(float)
    return None

def _label(s):
    return '' if s is None or str(s).startswith('_') else str(s)

def _describe(fig):
    from matplotlib.collections import PathCollection, PolyCollection, LineCollection
    from matplotlib.container import ErrorbarContainer, BarContainer
    w, h = fig.get_size_inches()
    out = {'w': float(w), 'h': float(h), 'size': float(__import__('matplotlib').rcParams['font.size']), 'rows': 1, 'cols': 1, 'axes': [], 'skipped': []}
    skipped = out['skipped']
    main = []
    for ax in fig.axes:
        if getattr(ax, '_colorbar', None) is not None or ax.get_label() == '<colorbar>':
            skipped.append('a colour bar')
            continue
        if ax.name != 'rectilinear':
            skipped.append('an axes of kind %s' % ax.name)
            continue
        main.append(ax)
    placed = []
    for ax in main:
        # a twin (twinx): its curves on the right axis of the axes it is laid over
        host = None
        for k, (other, _d) in enumerate(placed):
            if other.get_position().bounds == ax.get_position().bounds and ax.get_shared_x_axes().joined(ax, other):
                host = k
        if host is None:
            d = {'title': ax.get_title(), 'xlabel': ax.get_xlabel(), 'ylabel': ax.get_ylabel(), 'curves': [], 'lines': [], 'texts': [], 'legend': None,
                 'xscale': ax.get_xscale(), 'yscale': ax.get_yscale(), 'grid': bool(ax.xaxis._major_tick_kw.get('gridOn', False) or ax.yaxis._major_tick_kw.get('gridOn', False))}
            d['xlim'] = [float(v) for v in ax.get_xlim()] if not ax.get_autoscalex_on() else None
            d['ylim'] = [float(v) for v in ax.get_ylim()] if not ax.get_autoscaley_on() else None
            ss = ax.get_subplotspec()
            if ss is not None:
                nr, nc = ss.get_gridspec().get_geometry()
                out['rows'], out['cols'] = max(out['rows'], nr), max(out['cols'], nc)
                d['row'], d['col'] = int(ss.rowspan.start), int(ss.colspan.start)
            try:
                d['labelSize'] = float(ax.xaxis.label.get_size())
                tl = ax.xaxis.get_ticklabels()
                d['tickSize'] = float(tl[0].get_size()) if len(tl) else None
            except Exception:
                pass
            placed.append((ax, d))
            target, axis = d, 'y'
        else:
            target, axis = placed[host][1], 'y2'
            target['y2label'] = ax.get_ylabel()
            target['y2scale'] = ax.get_yscale()
            target['y2lim'] = [float(v) for v in ax.get_ylim()] if not ax.get_autoscaley_on() else None
        _axes_parts(ax, target, axis, skipped)
    out['axes'] = [d for _a, d in placed]
    return out

def _axes_parts(ax, d, axis, skipped):
    from matplotlib.collections import PathCollection, PolyCollection, LineCollection
    from matplotlib.container import ErrorbarContainer, BarContainer
    taken = set()
    curves = d['curves']
    # error bars: the data line, its bars (± from the segments), its caps
    for c in ax.containers:
        if isinstance(c, ErrorbarContainer):
            line, caps, bars = c.lines
            for x in caps:
                taken.add(id(x))
            for x in bars:
                taken.add(id(x))
            if line is None:
                continue
            taken.add(id(line))
            cv = _line_curve(line, axis)
            if cv is None:
                continue
            y = np.asarray(line.get_ydata(), dtype=float)
            x = np.asarray(line.get_xdata(), dtype=float)
            for lc in bars:
                segs = lc.get_segments()
                if len(segs) != len(x):
                    continue
                lo, hi = np.array([s[0] for s in segs], dtype=float), np.array([s[1] for s in segs], dtype=float)
                if np.allclose(lo[:, 0], hi[:, 0]):
                    minus, plus = y - np.minimum(lo[:, 1], hi[:, 1]), np.maximum(lo[:, 1], hi[:, 1]) - y
                    cv['yerr'] = _b(plus)
                    if not np.allclose(plus, minus):
                        cv['ylo'] = _b(minus)
                else:
                    cv['xerr'] = _b((np.maximum(lo[:, 0], hi[:, 0]) - np.minimum(lo[:, 0], hi[:, 0])) / 2)
                cv['errColor'] = _hex(lc.get_colors()[0]) if len(lc.get_colors()) else cv['color']
                cv['errWidth'] = float(lc.get_linewidths()[0]) if len(lc.get_linewidths()) else 0.8
            cv['errCap'] = float(caps[0].get_markersize()) if caps else 0.0
            # its label is the container's (the legend shows it)
            cv['label'] = _label(c.get_label()) or cv['label']
            curves.append(cv)
        elif isinstance(c, BarContainer):
            skipped.append('bars (make a Bar chart from the data)')
            for p in c.patches:
                taken.add(id(p))
    for line in ax.get_lines():
        if id(line) in taken:
            continue
        tr = line.get_transform()
        if tr == ax.get_yaxis_transform():
            d['lines'].append({'kind': 'hline', 'v': float(np.asarray(line.get_ydata(), dtype=float)[0]), 'color': _hex(line.get_color()), 'width': float(line.get_linewidth()), 'dash': _DASH.get(line.get_linestyle(), 'solid')})
            continue
        if tr == ax.get_xaxis_transform():
            d['lines'].append({'kind': 'vline', 'v': float(np.asarray(line.get_xdata(), dtype=float)[0]), 'color': _hex(line.get_color()), 'width': float(line.get_linewidth()), 'dash': _DASH.get(line.get_linestyle(), 'solid')})
            continue
        cv = _line_curve(line, axis)
        if cv is None:
            skipped.append('a line whose values are not numbers (dates?)')
        else:
            curves.append(cv)
    for coll in ax.collections:
        if id(coll) in taken:
            continue
        if isinstance(coll, PathCollection):
            off = np.asarray(coll.get_offsets(), dtype=float)
            if off.ndim != 2 or not len(off):
                continue
            fc = coll.get_facecolors()
            ec = coll.get_edgecolors()
            sizes = coll.get_sizes()
            arr = coll.get_array()
            cv = {'label': _label(coll.get_label()), 'x': _b(off[:, 0]), 'y': _b(off[:, 1]), 'mode': 'scatter', 'axis': axis,
                  'color': _hex(fc[0]) if len(fc) else (_hex(ec[0]) if len(ec) else '#000000'), 'alpha': float(coll.get_alpha() if coll.get_alpha() is not None else (fc[0][3] if len(fc) else 1)),
                  'ms': float(np.sqrt(np.mean(sizes))) if len(sizes) else 6.0, 'marker': 'circle', 'open': len(fc) == 0,
                  'mec': _hex(ec[0]) if len(ec) else '', 'mew': float(coll.get_linewidths()[0]) if len(coll.get_linewidths()) else 0.0}
            if arr is not None and len(arr) == len(off):
                skipped.append('colours from values (scatter c=…): drawn in one colour — set Colour map ▸ by a column in the Plot')
            if len(sizes) > 1 and np.ptp(sizes) > 0:
                skipped.append('sizes from values (scatter s=…): drawn at their mean size')
            curves.append(cv)
        elif isinstance(coll, PolyCollection) and not isinstance(coll, LineCollection):
            done = False
            paths = coll.get_paths()
            if len(paths) == 1:
                v = np.asarray(paths[0].vertices, dtype=float)
                if len(v) > 2 and np.allclose(v[0], v[-1]):
                    v = v[:-1]
                n = (len(v) - 2) // 2
                if n >= 2 and len(v) == 2 * n + 2:
                    up = v[1:n + 1]
                    low = v[n + 2:2 * n + 2][::-1]
                    if np.allclose(up[:, 0], low[:, 0]):
                        fc = coll.get_facecolors()
                        col = _hex(fc[0]) if len(fc) else '#1f77b4'
                        a = float(coll.get_alpha() if coll.get_alpha() is not None else (fc[0][3] if len(fc) else 0.3))
                        k = len(curves)
                        curves.append({'label': '', 'x': _b(low[:, 0]), 'y': _b(low[:, 1]), 'mode': 'line', 'axis': axis, 'color': col, 'lw': 0.0, 'hidden': True})
                        curves.append({'label': _label(coll.get_label()), 'x': _b(up[:, 0]), 'y': _b(up[:, 1]), 'mode': 'line', 'axis': axis, 'color': col, 'lw': 0.0, 'fillTo': k, 'fillAlpha': a})
                        done = True
            if not done:
                skipped.append('a filled shape (not a fill_between)')
        else:
            skipped.append('a %s' % type(coll).__name__)
    for t in ax.texts:
        x, y = t.get_position()
        coords = 'data' if t.get_transform() == ax.transData else ('axes' if t.get_transform() == ax.transAxes else None)
        if coords is None:
            skipped.append('a text placed otherwise than in data or axes units')
            continue
        d['texts'].append({'text': t.get_text(), 'x': float(x), 'y': float(y), 'coords': coords, 'size': float(t.get_fontsize()), 'color': _hex(t.get_color()), 'ha': t.get_ha(), 'va': t.get_va()})
    if ax.images:
        skipped.append('an image (imshow: use Contour / heatmap)')
    leg = ax.get_legend()
    if leg is not None and axis == 'y':
        d['legend'] = {'show': bool(leg.get_visible()), 'loc': _LOC.get(getattr(leg, '_loc', 0), 'auto'), 'frame': bool(leg.get_frame_on())}

def _line_curve(line, axis):
    x, y = _nums(line.get_xdata()), _nums(line.get_ydata())
    if x is None or y is None or len(x) != len(y):
        return None
    ls = line.get_linestyle()
    mk = line.get_marker()
    has_line = ls not in ('None', 'none', '', ' ')
    has_mark = mk not in (None, 'None', 'none', '', ' ')
    ds = line.get_drawstyle()
    mode = 'step' if ds.startswith('steps') and has_line else ('linesymbol' if has_line and has_mark else ('scatter' if has_mark else 'line'))
    mfc = line.get_markerfacecolor()
    cv = {'label': _label(line.get_label()), 'x': _b(x), 'y': _b(y), 'mode': mode, 'axis': axis, 'color': _hex(line.get_color()),
          'lw': float(line.get_linewidth()), 'dash': _DASH.get(ls, 'solid'), 'alpha': float(line.get_alpha() if line.get_alpha() is not None else _alpha_of(line.get_color())),
          'marker': _MARK.get(mk, 'circle') if has_mark else 'circle', 'ms': float(line.get_markersize()), 'open': isinstance(mfc, str) and mfc.lower() == 'none',
          'mec': _hex(line.get_markeredgecolor()), 'mew': float(line.get_markeredgewidth())}
    if mode == 'step':
        cv['step'] = 'vh' if ds == 'steps-pre' or ds == 'steps' else ('mid' if ds == 'steps-mid' else 'hv')
    return cv

_RUN = [0]

def _run(code, inputs):
    """Runs the code with the inputs: the outputs, the printed text, the last expression, the figures, the files, an error."""
    _RUN[0] += 1
    g = {'__name__': '__main__', 'np': np, 'Table': Table, 'roles': roles}
    for item in inputs:
        g[item['name']] = _var_in(item['value'])
    before = set(g)
    out, err = io.StringIO(), io.StringIO()
    old = sys.stdout, sys.stderr, os.getcwd()
    work = '/home/pyodide/run%d' % _RUN[0]
    os.makedirs(work, exist_ok=True)
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is not None:
        plt.close('all')
    shown, error = None, None
    t0 = time.time()
    try:
        sys.stdout, sys.stderr = out, err
        os.chdir(work)
        tree = ast.parse(code, '<script>')
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, '<script>', 'exec'), g)
        if last is not None:
            shown = eval(compile(last, '<script>', 'eval'), g)
    except BaseException as e:
        line = None
        if isinstance(e, SyntaxError) and e.filename == '<script>':
            line = e.lineno
        for fr in traceback.extract_tb(e.__traceback__):
            if fr.filename == '<script>':
                line = fr.lineno
        msg = ''.join(traceback.format_exception_only(type(e), e)).strip()
        error = {'message': msg}
        if line:
            error['line'] = line
    finally:
        sys.stdout, sys.stderr = old[0], old[1]
        os.chdir(old[2])
    ms = int((time.time() - t0) * 1000)
    outputs, skipped = [], []
    if error is None:
        for k, v in list(g.items()):
            if k in before or k.startswith('_') or isinstance(v, type(sys)) or callable(v) and not isinstance(v, np.ndarray):
                continue
            mpl = sys.modules.get('matplotlib.figure')
            if mpl is not None and isinstance(v, (mpl.Figure,)):
                continue
            try:
                o = _out(k, v)
            except Exception as e:
                o = None
            if o is None:
                skipped.append({'name': k, 'type': type(v).__name__})
            else:
                outputs.append(o)
    figures = []
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is not None:
        for num in plt.get_fignums():
            fig = plt.figure(num)
            buf = io.StringIO()
            try:
                fig.savefig(buf, format='svg')
                f = {'num': int(num), 'svg': buf.getvalue()}
                try:
                    f['desc'] = _describe(fig)
                except Exception as e:
                    err.write('The figure %d could not be read for Make Plot: %s\n' % (num, e))
                figures.append(f)
            except Exception as e:
                err.write('The figure %d could not be drawn: %s\n' % (num, e))
        plt.close('all')
    files = []
    for root, _dirs, names in os.walk(work):
        for nm in sorted(names):
            p = os.path.join(root, nm)
            with open(p, 'rb') as f:
                files.append({'name': os.path.relpath(p, work).replace(os.sep, '/'), 'bytes': f.read()})
    shutil.rmtree(work, ignore_errors=True)
    text = out.getvalue() + err.getvalue()
    if len(text) > 200000:
        text = '… (the start left out)\n' + text[-200000:]
    try:
        disp = _display(shown) if error is None else None
    except Exception as e:
        disp = {'text': '(could not be shown: %s)' % e}
    res = {'outputs': outputs, 'skipped': skipped, 'console': text, 'figures': figures, 'files': files, 'ms': ms}
    if disp is not None:
        res['display'] = disp
    if error is not None:
        res['error'] = error
    return res
`;
