# The reference values of npm run check for the Probability plot node (scipy):
# python -W ignore scripts/fixtures/prob-ref.py
import json, os
import numpy as np
from scipy import optimize, stats

rng = np.random.default_rng(11)
data = {
    'normal': rng.normal(50, 8, 40).tolist(),
    'lognormal': rng.lognormal(1.2, 0.6, 35).tolist(),
    'exponential': rng.exponential(3.0, 30).tolist(),
    'weibull': (4.0 * rng.weibull(2.3, 50)).tolist(),
    'gamma': rng.gamma(3.5, 2.0, 45).tolist(),
    'logistic': rng.logistic(10, 2, 40).tolist(),
    'gumbel': rng.gumbel(5, 1.5, 40).tolist(),
    'uniform': rng.uniform(2, 7, 25).tolist(),
}
# the parameters as the node writes them (μ, σ of ln x for the lognormal; a, b for the uniform)
fits = {}
x = np.array(data['normal']); fits['normal'] = list(stats.norm.fit(x))
s, _, sc = stats.lognorm.fit(np.array(data['lognormal']), floc=0); fits['lognormal'] = [np.log(sc), s]
_, sc = stats.expon.fit(np.array(data['exponential']), floc=0); fits['exponential'] = [sc]
# Weibull: scipy's optimizer stops ~1e-5 short of the maximum; the likelihood equation solved exactly (brentq), checked
# against scipy's fit
xw = np.array(data['weibull'])
c = optimize.brentq(lambda k: np.sum(xw**k * np.log(xw)) / np.sum(xw**k) - 1 / k - np.mean(np.log(xw)), 0.1, 20, xtol=1e-15)
fits['weibull'] = [c, np.mean(xw**c) ** (1 / c)]
cs, _, scs = stats.weibull_min.fit(xw, floc=0)
assert abs(cs / c - 1) < 1e-4 and abs(scs / fits['weibull'][1] - 1) < 1e-4
assert stats.weibull_min.logpdf(xw, c, scale=fits['weibull'][1]).sum() >= stats.weibull_min.logpdf(xw, cs, scale=scs).sum()
a, _, sc = stats.gamma.fit(np.array(data['gamma']), floc=0); fits['gamma'] = [a, sc]
fits['logistic'] = list(stats.logistic.fit(np.array(data['logistic'])))
fits['gumbel'] = list(stats.gumbel_r.fit(np.array(data['gumbel'])))
lo, sc = stats.uniform.fit(np.array(data['uniform'])); fits['uniform'] = [lo, lo + sc]

# scipy probplot (Filliben's positions) against the standard distribution with the fitted shape
std = {
    'normal': (stats.norm, ()),
    'lognormal': (stats.lognorm, (fits['lognormal'][1],)),
    'exponential': (stats.expon, ()),
    'weibull': (stats.weibull_min, (fits['weibull'][0],)),
    'gamma': (stats.gamma, (fits['gamma'][0],)),
    'logistic': (stats.logistic, ()),
    'gumbel': (stats.gumbel_r, ()),
    'uniform': (stats.uniform, ()),
}
probplot = {}
for k, (dist, sp) in std.items():
    (osm, osr), (slope, intercept, r) = stats.probplot(np.array(data[k]), dist=dist, sparams=sp)
    probplot[k] = {'osm': osm.tolist(), 'osr': osr.tolist(), 'slope': slope, 'intercept': intercept, 'r': r}

# Anderson–Darling (scipy anderson: the statistic; the 5 % critical value)
anderson = {}
for k, name in [('normal', 'norm'), ('exponential', 'expon'), ('logistic', 'logistic'), ('gumbel', 'gumbel_r')]:
    res = stats.anderson(np.array(data[k]), name)
    sig = list(res.significance_level)
    anderson[k] = {'A2': float(res.statistic), 'crit5': float(res.critical_values[sig.index(5.0)])}

# ECDF with ties, and its 95 % pointwise band (scipy ecdf, Greenwood = F ± z·√(F(1 − F)/n) without censoring)
ties = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3]
e = stats.ecdf(ties)
ci = e.cdf.confidence_interval(0.95)
# (at F = 1 scipy gives NaN — Greenwood's n − d = 0; the band is then [1, 1])
ecdf = {'x': e.cdf.quantiles.tolist(), 'F': e.cdf.probabilities.tolist(), 'lo': np.nan_to_num(ci.low.probabilities, nan=1.0).tolist(), 'hi': np.nan_to_num(ci.high.probabilities, nan=1.0).tolist()}

# the pointwise band of a normal Q-Q plot (R car::qqPlot): Blom's positions, the least-squares line, at the node's grid
xs = np.sort(np.array(data['normal']))
n = len(xs)
pos = (np.arange(1, n + 1) - 0.375) / (n + 0.25)
z = stats.norm.ppf(pos)
b, a = np.polyfit(z, xs, 1)
l0, l1 = np.log(pos[0] / (1 - pos[0])), np.log(pos[-1] / (1 - pos[-1]))
grid = 1 / (1 + np.exp(-(l0 + (l1 - l0) * np.arange(121) / 120)))
zg = stats.norm.ppf(grid)
se = b / stats.norm.pdf(zg) * np.sqrt(grid * (1 - grid) / n)
zc = stats.norm.ppf(0.975)
band = {'z': zg.tolist(), 'line': (a + b * zg).tolist(), 'hi': (a + b * zg + zc * se).tolist(), 'lo': (a + b * zg - zc * se).tolist()}

# the standard gamma's quantiles
gppf = [[sh, p, float(stats.gamma.ppf(p, sh))] for sh in [0.3, 1.0, 3.5, 40.0] for p in [1e-4, 0.01, 0.3, 0.5, 0.9, 0.9999]]

out = {'data': data, 'fits': fits, 'probplot': probplot, 'anderson': anderson, 'ties': ties, 'ecdf': ecdf, 'band': band, 'gammaPpf': gppf}
with open(os.path.join(os.path.dirname(__file__), 'prob-ref.json'), 'w') as f:
    json.dump(out, f, default=float)
print('ok', {k: [round(v, 6) for v in p] for k, p in fits.items()}, anderson)
