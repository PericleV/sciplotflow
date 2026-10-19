# The reference values of npm run check for the regressions (NumPy least squares; the logistic likelihood maximized by
# SciPy), the power and sample sizes (SciPy's noncentral t and F, as statsmodels' power classes use them) and the
# principal components (scikit-learn).
# python -W ignore scripts/fixtures/stat2-ref.py
import json, os
import numpy as np
from scipy import stats, optimize
from sklearn.decomposition import PCA

rng = np.random.default_rng(11)
n = 60
x1 = rng.normal(5, 2, n)
x2 = 0.6 * x1 + rng.normal(0, 1.5, n)
x3 = rng.uniform(0, 10, n)
y = 2 + 1.5 * x1 - 0.8 * x2 + 0.3 * x3 + rng.normal(0, 1.2, n)


def ols(X, y):
    A = np.column_stack([np.ones(len(y)), X])
    b, *_ = np.linalg.lstsq(A, y, rcond=None)
    r = y - A @ b
    dfe = len(y) - A.shape[1]
    s2 = r @ r / dfe
    cov = s2 * np.linalg.inv(A.T @ A)
    se = np.sqrt(np.diag(cov))
    t = b / se
    p = 2 * stats.t.sf(np.abs(t), dfe)
    tc = stats.t.ppf(0.975, dfe)
    sst = ((y - y.mean()) ** 2).sum()
    r2 = 1 - (r @ r) / sst
    k = A.shape[1] - 1
    F = (sst - r @ r) / k / s2
    ll = -len(y) / 2 * (np.log(2 * np.pi) + np.log(r @ r / len(y)) + 1)
    return {'b': b.tolist(), 'se': se.tolist(), 'p': p.tolist(), 'ci': np.column_stack([b - tc * se, b + tc * se]).tolist(), 'r2': r2,
            'r2a': 1 - (1 - r2) * (len(y) - 1) / dfe, 'F': F, 'pF': stats.f.sf(F, k, dfe), 'aic': -2 * ll + 2 * A.shape[1], 'bic': -2 * ll + A.shape[1] * np.log(len(y)), 'll': ll}


X = np.column_stack([x1, x2, x3])
o = ols(X, y)
o['vif'] = [1 / (1 - ols(np.delete(X, j, 1), X[:, j])['r2']) for j in range(3)]
out = {'x1': x1.tolist(), 'x2': x2.tolist(), 'x3': x3.tolist(), 'y': y.tolist(), 'ols': o}
# logistic: the probability of a yes grows with x1, falls with x3
eta = -3 + 0.7 * x1 - 0.25 * x3
yb = (rng.uniform(size=n) < 1 / (1 + np.exp(-eta))).astype(float)
A = np.column_stack([np.ones(n), x1, x3])
nll = lambda b: -(yb * (A @ b) - np.logaddexp(0, A @ b)).sum()
res = optimize.minimize(nll, np.zeros(3), method='BFGS', options={'gtol': 1e-10})
b = res.x
pr = 1 / (1 + np.exp(-(A @ b)))
H = A.T @ (A * (pr * (1 - pr))[:, None])
se = np.sqrt(np.diag(np.linalg.inv(H)))
ll = -nll(b)
m = yb.mean()
ll0 = n * (m * np.log(m) + (1 - m) * np.log(1 - m))
out['logit'] = {'y': yb.tolist(), 'b': b.tolist(), 'se': se.tolist(), 'p': (2 * stats.norm.sf(np.abs(b / se))).tolist(), 'll': ll, 'll0': ll0, 'r2': 1 - ll / ll0, 'aic': -2 * ll + 6, 'bic': -2 * ll + 3 * np.log(n), 'lr': 2 * (ll - ll0), 'plr': stats.chi2.sf(2 * (ll - ll0), 2)}


def pt(d, n1, n2, a, alt):
    two = n2 is not None
    df = n1 + n2 - 2 if two else n1 - 1
    nc = d * np.sqrt(n1 * n2 / (n1 + n2)) if two else d * np.sqrt(n1)
    if alt == 'two-sided':
        c = stats.t.ppf(1 - a / 2, df)
        return stats.nct.sf(c, df, nc) + stats.nct.cdf(-c, df, nc)
    c = stats.t.ppf(1 - a, df)
    return stats.nct.sf(c, df, nc) if alt == 'greater' else stats.nct.cdf(-c, df, nc)


def pf(f, k, N, a):
    c = stats.f.ppf(1 - a, k - 1, N - k)
    return stats.ncf.sf(c, k - 1, N - k, f * f * N)


def smallest(fn, target):
    nn = 2
    while fn(nn) < target:
        nn += 1
    return nn


out['power'] = {
    'one': [pt(0.5, 20, None, 0.05, a) for a in ['two-sided', 'greater', 'less']],
    'one_neg': pt(-0.5, 20, None, 0.05, 'less'),
    'two': [pt(0.6, 25, 25, 0.05, 'two-sided'), pt(0.6, 25, 40, 0.01, 'greater')],
    'n_one': smallest(lambda k: pt(0.5, k, None, 0.05, 'two-sided'), 0.8),
    'n_two': smallest(lambda k: pt(0.6, k, k, 0.05, 'two-sided'), 0.9),
    'anova': [pf(0.25, 4, 80, 0.05), pf(0.4, 3, 45, 0.01)],
    'n_anova': 4 * smallest(lambda k: pf(0.25, 4, 4 * k, 0.05), 0.8),
}
Z = np.column_stack([x1, x2, x3, y])
Zs = (Z - Z.mean(0)) / Z.std(0, ddof=1)
pc = PCA().fit(Zs)
pcc = PCA().fit(Z - Z.mean(0))
out['pca'] = {'ratio': pc.explained_variance_ratio_.tolist(), 'var': pc.explained_variance_.tolist(), 'comp': np.abs(pc.components_).tolist(), 'ratio_cov': pcc.explained_variance_ratio_.tolist()}
with open(os.path.join(os.path.dirname(__file__), 'stat2-ref.json'), 'w') as f:
    json.dump(out, f)
print('ok', out['power']['n_one'], out['power']['n_two'], out['power']['n_anova'], res.success)
