# Reference values for Quick fit (scripts/check.ts): scipy.optimize.curve_fit (two Gaussians on a constant, the
# covariance scaled by the residual variance) and scipy.stats.linregress (a line on a range, its standard errors).
# Run: python -I quickfit-ref.py > quickfit-ref.json
import json, math
import numpy as np
from scipy.optimize import curve_fit
from scipy.stats import linregress

x = np.array([i * 0.05 for i in range(201)])
G = lambda x, A, c, w: A * np.exp(-4 * math.log(2) * (x - c) ** 2 / (w * w))
y = np.array([0.5 + G(xi, 3, 3, 1) + G(xi, 2, 6.5, 1.5) + 0.02 * math.sin(i * 7.3) for i, xi in enumerate(x)])

def model(x, c, A1, xc1, w1, A2, xc2, w2):
    return c + G(x, A1, xc1, w1) + G(x, A2, xc2, w2)

p, cov = curve_fit(model, x, y, p0=[0.4, 2.5, 2.8, 1.2, 1.5, 6.8, 1.2])
err = np.sqrt(np.diag(cov))
k = math.sqrt(math.pi / (4 * math.log(2)))
# the areas A·w·√(π/(4 ln 2)) and their errors from the covariance (delta method)
def area(i, j):
    g = np.zeros(7); g[i] = p[j] * k; g[j] = p[i] * k
    return [p[i] * p[j] * k, math.sqrt(g @ cov @ g)]
m = (x >= 0) & (x <= 1.5)
lr = linregress(x[m], y[m])
print(json.dumps({
    'x': x.tolist(), 'y': y.tolist(),
    'peaks': {'names': ['c', 'A1', 'xc1', 'w1', 'A2', 'xc2', 'w2'], 'p': p.tolist(), 'err': err.tolist(), 'area1': area(1, 3), 'area2': area(4, 6)},
    'line': {'a': lr.intercept, 'b': lr.slope, 'sa': lr.intercept_stderr, 'sb': lr.stderr, 'r2': lr.rvalue ** 2, 'n': int(m.sum())},
}))
