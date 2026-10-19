# The reference values of npm run check for the Histogram node (numpy / scipy / sklearn):
# python -W ignore scripts/fixtures/hist-ref.py
import json, os
import numpy as np
from scipy import stats
from scipy.optimize import curve_fit
from sklearn.mixture import GaussianMixture

rng = np.random.default_rng(11)
A = rng.normal(5, 1.2, 300)  # one normal
B = np.concatenate([rng.normal(2, 0.5, 200), rng.normal(5, 0.8, 150)])  # two
C = stats.cauchy.rvs(10, 0.5, size=300, random_state=rng)  # Cauchy (Lorentzian)
out = {'A': A.tolist(), 'B': B.tolist(), 'C': C.tolist()}

# the bins: numpy's rules and their counts, a count of bins, the density
out['edges'] = {m: np.histogram_bin_edges(A, bins=m).tolist() for m in ['auto', 'sturges', 'scott', 'fd', 'sqrt', 'rice']}
out['edges10'] = np.histogram_bin_edges(A, bins=10).tolist()
out['counts10'] = np.histogram(A, bins=10)[0].tolist()
out['density10'] = np.histogram(A, bins=10, density=True)[0].tolist()
out['countsRange'] = np.histogram(A, bins=8, range=(3, 7))[0].tolist()
edges = [0, 3, 4, 4.5, 5, 6, 10]
out['countsEdges'] = np.histogram(A, bins=edges)[0].tolist()

# Normal from the data (mean, SD with n − 1, as Origin), the χ² of the fit over 10 bins
mu, sd = A.mean(), A.std(ddof=1)
e = np.array(out['edges10'])
O = np.array(out['counts10'], float)
E = len(A) * np.diff(stats.norm.cdf(e, mu, sd))
chi2 = float(((O - E) ** 2 / E).sum())
dof = len(O) - 1 - 2
out['normal'] = {'mu': mu, 'sd': sd, 'seMu': sd / np.sqrt(len(A)), 'seSd': sd / np.sqrt(2 * (len(A) - 1)), 'chi2': chi2, 'dof': dof, 'p': float(stats.chi2.sf(chi2, dof))}

# a Gaussian fitted to the bars (20 bins, counts): A·exp(−(x − xc)²/(2σ²)) — curve_fit (errors scaled by χ²ᵣ)
c20, e20 = np.histogram(A, bins=20)
x20 = (e20[:-1] + e20[1:]) / 2
g = lambda x, a, xc, s: a * np.exp(-((x - xc) ** 2) / (2 * s ** 2))
p, cov = curve_fit(g, x20, c20, p0=[c20.max(), mu, sd])
out['gaussBars'] = {'A': p[0], 'xc': p[1], 's': abs(p[2]), 'eA': float(np.sqrt(cov[0, 0])), 'exc': float(np.sqrt(cov[1, 1])), 'es': float(np.sqrt(cov[2, 2]))}

# two normals from the data (maximum likelihood, EM): sklearn, sorted by the mean
gm = GaussianMixture(2, tol=1e-12, max_iter=20000, n_init=10, random_state=0).fit(B.reshape(-1, 1))
o = np.argsort(gm.means_.ravel())
out['binormal'] = {'w': gm.weights_[o].tolist(), 'mu': gm.means_.ravel()[o].tolist(), 'sd': np.sqrt(gm.covariances_.ravel()[o]).tolist(), 'loglik': float(gm.score(B.reshape(-1, 1)) * len(B))}

# two Gaussians fitted to the bars (30 bins)
c30, e30 = np.histogram(B, bins=30)
x30 = (e30[:-1] + e30[1:]) / 2
g2 = lambda x, a1, m1, s1, a2, m2, s2: g(x, a1, m1, s1) + g(x, a2, m2, s2)
p2, cov2 = curve_fit(g2, x30, c30, p0=[c30.max(), 2, 0.5, c30.max() / 2, 5, 0.8])
out['binormalBars'] = {'p': p2.tolist(), 'e': np.sqrt(np.diag(cov2)).tolist()}

# Lorentzian: Cauchy from the data (maximum likelihood), and fitted to the bars (40 bins over 5 … 15)
loc, scale = stats.cauchy.fit(C)
out['cauchy'] = {'x0': loc, 'g': scale}
c40, e40 = np.histogram(C, bins=40, range=(5, 15))
x40 = (e40[:-1] + e40[1:]) / 2
L = lambda x, a, xc, gm_: a / (1 + ((x - xc) / gm_) ** 2)
p3, cov3 = curve_fit(L, x40, c40, p0=[c40.max(), 10, 0.5])
out['lorentzBars'] = {'p': [p3[0], p3[1], abs(p3[2])], 'e': np.sqrt(np.diag(cov3)).tolist()}

# kernel density (Gaussian kernel): Scott's and Silverman's bandwidths, at a few points
xs = [2.0, 4.0, 5.0, 6.5, 8.0]
out['kde'] = {'x': xs, 'scott': stats.gaussian_kde(A, 'scott')(xs).tolist(), 'silverman': stats.gaussian_kde(A, 'silverman')(xs).tolist()}

with open(os.path.join(os.path.dirname(__file__), 'hist-ref.json'), 'w') as f:
    json.dump(out, f)
print('ok', out['normal'], out['binormal']['mu'], out['cauchy'])
