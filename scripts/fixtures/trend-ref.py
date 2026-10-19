# References for the trend lines of a Plot (src/engine/trend.ts): numpy's least squares (polyfit; the exponential and
# the power on ln y, as spreadsheets fit them), the band of the mean t·s·√(x₀ᵀ(XᵀX)⁻¹x₀) with the inverse taken
# directly, a centred moving average. python trend-ref.py > trend-ref.json
import json
import sys

import numpy as np
from scipy import stats

rng = np.random.default_rng(7)
x = np.linspace(0.5, 10, 25)
y_lin = 2.3 * x + 1.1 + rng.normal(0, 0.8, x.size)
y_poly = 0.4 * x**2 - 2.0 * x + 3 + rng.normal(0, 0.6, x.size)
y_exp = 1.8 * np.exp(0.27 * x) * np.exp(rng.normal(0, 0.05, x.size))
y_pow = 2.2 * x**1.6 * np.exp(rng.normal(0, 0.05, x.size))
y_log = 3.0 * np.log(x) + 1.5 + rng.normal(0, 0.2, x.size)
xs = np.linspace(x.min(), x.max(), 201)

def fit(X, v, X0, level=0.95):
    beta, *_ = np.linalg.lstsq(X, v, rcond=None)
    res = v - X @ beta
    n, p = X.shape
    s2 = res @ res / (n - p)
    inv = np.linalg.inv(X.T @ X)
    t = stats.t.ppf(1 - (1 - level) / 2, n - p)
    half = t * np.sqrt(s2 * np.einsum('ij,jk,ik->i', X0, inv, X0))
    return beta, res @ res, half

out = {'x': x.tolist(), 'xs': xs.tolist()}
V = lambda q, d: np.vander(q, d + 1, increasing=True)
b, sse, h = fit(V(x, 1), y_lin, V(xs, 1))
out['linear'] = {'y': y_lin.tolist(), 'coef': b.tolist(), 'r2': 1 - sse / np.sum((y_lin - y_lin.mean()) ** 2), 'lo': (V(xs, 1) @ b - h).tolist(), 'hi': (V(xs, 1) @ b + h).tolist(), 'polyfit': np.polyfit(x, y_lin, 1).tolist()}
b0, sse0, _ = fit(x[:, None], y_lin, xs[:, None])
out['origin'] = {'coef': b0.tolist(), 'r2': 1 - sse0 / np.sum(y_lin**2)}
b, sse, h = fit(V(x, 3), y_poly, V(xs, 3))
out['poly3'] = {'y': y_poly.tolist(), 'coef': b.tolist(), 'r2': 1 - sse / np.sum((y_poly - y_poly.mean()) ** 2), 'lo': (V(xs, 3) @ b - h).tolist(), 'hi': (V(xs, 3) @ b + h).tolist()}
ly = np.log(y_exp)
b, sse, h = fit(V(x, 1), ly, V(xs, 1))
out['exp'] = {'y': y_exp.tolist(), 'A': float(np.exp(b[0])), 'B': float(b[1]), 'r2': 1 - sse / np.sum((ly - ly.mean()) ** 2), 'lo': np.exp(V(xs, 1) @ b - h).tolist(), 'hi': np.exp(V(xs, 1) @ b + h).tolist()}
lx, lyp = np.log(x), np.log(y_pow)
b, sse, _ = fit(V(lx, 1), lyp, V(np.log(xs), 1))
out['power'] = {'y': y_pow.tolist(), 'A': float(np.exp(b[0])), 'B': float(b[1]), 'r2': 1 - sse / np.sum((lyp - lyp.mean()) ** 2)}
b, sse, _ = fit(V(lx, 1), y_log, V(np.log(xs), 1))
out['log'] = {'y': y_log.tolist(), 'coef': b.tolist(), 'r2': 1 - sse / np.sum((y_log - y_log.mean()) ** 2)}
w = 5
out['movavg'] = {'w': w, 'x': (np.convolve(x, np.ones(w) / w, 'valid')).tolist(), 'y': (np.convolve(y_lin, np.ones(w) / w, 'valid')).tolist()}
json.dump(out, sys.stdout, indent=1, default=float)
