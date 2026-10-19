# The reference values of npm run check for the baselines (NumPy, SciPy's sparse solver): the iterative polynomial,
# asymmetric least squares, airPLS, SNIP (log-log-square-root), Shirley, Tougaard — on a spectrum of three peaks over a
# curved background, a little noise.
# python -W ignore scripts/fixtures/baseline-ref.py
import json, os
import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve

rng = np.random.default_rng(3)
x = np.linspace(0, 100, 240)
bg = 5 + 0.08 * x + 0.0015 * x ** 2
peaks = 30 * np.exp(-0.5 * ((x - 25) / 2.5) ** 2) + 18 * np.exp(-0.5 * ((x - 55) / 4) ** 2) + 40 / (1 + ((x - 78) / 1.8) ** 2)
y = bg + peaks + rng.normal(0, 0.2, x.size)
n = x.size


def whittaker(y, w, lam):
    D = sparse.diags([1, -2, 1], [0, 1, 2], shape=(n - 2, n))
    A = sparse.diags(w) + lam * (D.T @ D)
    return spsolve(A.tocsc(), w * y)


def asls(y, lam, p):
    w = np.ones(n)
    for _ in range(50):
        z = whittaker(y, w, lam)
        nw = np.where(y > z, p, 1 - p)
        same = np.array_equal(nw, w)
        w = nw
        if same:
            break
    return z


def airpls(y, lam):
    w = np.ones(n)
    total = np.abs(y).sum()
    for t in range(1, 16):
        z = whittaker(y, w, lam)
        d = y - z
        dssn = np.abs(d[d < 0].sum())
        if dssn < 0.001 * total or t == 15:
            break
        w = np.where(d >= 0, 0, np.exp(t * np.abs(d) / dssn))
        w[0] = w[-1] = np.exp(t * d[d < 0].max() / dssn)
    return z


def modpoly(x, y, k):
    t = 2 * (x - x[0]) / (x[-1] - x[0]) - 1
    V = np.vander(t, k + 1)
    fit = V @ np.linalg.lstsq(V, y, rcond=None)[0]
    z = y.copy()
    for _ in range(200):
        nz = np.minimum(z, fit)
        f2 = V @ np.linalg.lstsq(V, nz, rcond=None)[0]
        stop = ((f2 - fit) ** 2).sum() <= 1e-12 * ((fit ** 2).sum() or 1)
        z, fit = nz, f2
        if stop:
            break
    return fit


def snip(y, m, lls=True):
    low = min(0, y.min())
    v = np.log(np.log(np.sqrt(y - low + 1) + 1) + 1) if lls else y.copy()
    for p in range(1, m + 1):
        nv = v.copy()
        nv[p:n - p] = np.minimum(v[p:n - p], (v[:n - 2 * p] + v[2 * p:]) / 2)
        v = nv
    return (np.exp(np.exp(v) - 1) - 1) ** 2 - 1 + low if lls else v


def ends(y, m):
    return y[:m].mean(), y[-m:].mean()


def shirley(x, y, m):
    yl, yr = ends(y, m)
    b = np.full(n, min(yl, yr))
    for _ in range(100):
        h = y - b
        seg = (h[:-1] + h[1:]) / 2 * np.diff(x)
        q = np.concatenate([np.cumsum(seg[::-1])[::-1], [0]])
        nb = yr + (yl - yr) * q / q[0]
        ch = np.abs(nb - b).max()
        b = nb
        if ch <= 1e-9 * max(np.abs(y - yr).max(), np.abs(y - yl).max()):
            break
    return b


def tougaard(x, y, m, C):
    ys, ye = ends(y, m)
    dx = np.empty(n)
    dx[0] = (x[1] - x[0]) / 2
    dx[-1] = (x[-1] - x[-2]) / 2
    dx[1:-1] = (x[2:] - x[:-2]) / 2
    j = y - ys
    s = np.zeros(n)
    for i in range(1, n):
        T = x[i] - x[:i]
        s[i] = (T / (C + T ** 2) ** 2 * j[:i] * dx[:i]).sum()
    return ys + (ye - ys) / s[-1] * s


out = {
    'x': x.tolist(),
    'y': y.tolist(),
    'bg': bg.tolist(),
    'poly3': modpoly(x, y, 3).tolist(),
    'asls': asls(y, 1e5, 0.01).tolist(),
    'airpls': airpls(y, 1e5).tolist(),
    'snip': snip(y, 12).tolist(),
    'shirley': shirley(x, y, 4).tolist(),
    'tougaard': tougaard(x, y, 4, 1643).tolist(),
}
with open(os.path.join(os.path.dirname(__file__), 'baseline-ref.json'), 'w') as f:
    json.dump(out, f)
print('ok', np.abs(np.array(out['asls']) - bg).max(), np.abs(np.array(out['airpls']) - bg).max(), np.abs(np.array(out['poly3']) - bg).max())
