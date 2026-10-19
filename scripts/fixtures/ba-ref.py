# The reference values of npm run check for the Bland–Altman node (numpy / scipy, written out from the papers):
# python -W ignore scripts/fixtures/ba-ref.py
import json, os
import numpy as np
from scipy import stats

rng = np.random.default_rng(5)
n = 40
truth = rng.uniform(80, 220, n)
a = truth + rng.normal(0, 6, n)
b = truth * 1.04 - 3 + rng.normal(0, 6, n)  # a proportional bias
out = {'a': a.tolist(), 'b': b.tolist()}


def agreement(x, e, z=stats.norm.ppf(0.975), level=0.95):
    n = len(e)
    m, s = e.mean(), e.std(ddof=1)
    tq = stats.t.ppf(1 - (1 - level) / 2, n - 1)
    se = s * np.sqrt(1 / n + z * z / (2 * (n - 1)))  # Bland & Altman 1999
    ql, qh = stats.nct.ppf([(1 - level) / 2, 1 - (1 - level) / 2], n - 1, z * np.sqrt(n))  # Carkeet 2015
    lr = stats.linregress(x, e)
    res = np.abs(e - (lr.intercept + lr.slope * x))
    lr2 = stats.linregress(x, res)
    return {
        'bias': m, 'sd': s, 'biasCI': [m - tq * s / np.sqrt(n), m + tq * s / np.sqrt(n)],
        'lower': m - z * s, 'upper': m + z * s,
        'lowerCIapprox': [m - z * s - tq * se, m - z * s + tq * se], 'upperCIapprox': [m + z * s - tq * se, m + z * s + tq * se],
        'upperCIexact': [m + s * ql / np.sqrt(n), m + s * qh / np.sqrt(n)], 'lowerCIexact': [m - s * qh / np.sqrt(n), m - s * ql / np.sqrt(n)],
        'slope': lr.slope, 'intercept': lr.intercept, 'r': lr.rvalue, 'p': lr.pvalue,
        'reg': [lr.intercept, lr.slope, lr2.intercept, lr2.slope],
        'median': np.percentile(e, 50), 'p025': np.percentile(e, 2.5), 'p975': np.percentile(e, 97.5),
    }


mean = (a + b) / 2
out['diff'] = agreement(mean, a - b)
out['pct'] = agreement(mean, 100 * (a - b) / mean)
out['ratio'] = agreement(np.sqrt(a * b), np.log(a / b))  # X: the geometric mean; the limits from the logs
with open(os.path.join(os.path.dirname(__file__), 'ba-ref.json'), 'w') as f:
    json.dump(out, f, default=float)
print('ok', {k: round(out['diff'][k], 4) for k in ['bias', 'sd', 'lower', 'upper', 'slope', 'p']})
