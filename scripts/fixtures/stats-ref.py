# The reference values of npm run check for the statistics (scipy): python -W ignore scripts/fixtures/stats-ref.py
import json, numpy as np
from scipy import stats
rng = np.random.default_rng(42)
out = {}
A = list(np.round(rng.normal(10, 2, 15), 3))
B = list(np.round(rng.normal(11.5, 3, 12), 3))
C = list(np.round(rng.normal(12, 2, 14), 3))
D = list(np.round(rng.gamma(2, 2, 30), 3))
small1 = [1.1, 2.3, 3.0, 4.8, 5.5]
small2 = [2.2, 3.9, 6.1, 7.0, 8.4, 9.9]
tied1 = [1, 2, 2, 3, 3, 3, 4, 5, 5, 6, 7, 7]
tied2 = [2, 3, 4, 4, 5, 6, 6, 6, 7, 8, 9, 9, 10]
out['data'] = dict(A=A, B=B, C=C, D=D, small1=small1, small2=small2, tied1=tied1, tied2=tied2)
def norm_tests(x):
    x = np.array(x)
    sw = stats.shapiro(x)
    ad = stats.anderson(x, dist='norm', method='interpolate')
    ks = stats.kstest(x, 'norm', args=(x.mean(), x.std(ddof=1)))
    nt = stats.normaltest(x) if len(x) >= 8 else None
    return dict(sw=[sw.statistic, sw.pvalue], ad=ad.statistic, ks=ks.statistic, nt=[nt.statistic, nt.pvalue] if nt else None)
out['norm'] = {k: norm_tests(v) for k, v in dict(A=A, B=B, D=D, small1=small1).items()}
t1 = stats.ttest_1samp(A, 9.5); ci1 = t1.confidence_interval()
out['t1'] = [t1.statistic, t1.pvalue, t1.df, ci1.low, ci1.high, stats.ttest_1samp(A, 9.5, alternative='greater').pvalue]
for eq in [True, False]:
    r = stats.ttest_ind(A, B, equal_var=eq); ci = r.confidence_interval()
    out['t2_%s' % eq] = [r.statistic, r.pvalue, r.df, ci.low, ci.high]
pr = stats.ttest_rel(A[:12], B); cip = pr.confidence_interval()
out['tp'] = [pr.statistic, pr.pvalue, pr.df, cip.low, cip.high]
out['levene_mean'] = list(stats.levene(A, B, C, center='mean'))
out['levene_median'] = list(stats.levene(A, B, C, center='median'))
out['bartlett'] = list(stats.bartlett(A, B, C))
out['anova'] = list(stats.f_oneway(A, B, C))
try:
    out['welch'] = list(stats.f_oneway(A, B, C, equal_var=False))
except TypeError:
    out['welch'] = None
tk = stats.tukey_hsd(A, B, C); tci = tk.confidence_interval()
out['tukey'] = dict(p=tk.pvalue.tolist(), lo=tci.low.tolist(), hi=tci.high.tolist())
out['mwu_small'] = [stats.mannwhitneyu(small1, small2).statistic, stats.mannwhitneyu(small1, small2).pvalue]
out['mwu_tied'] = [stats.mannwhitneyu(tied1, tied2).statistic, stats.mannwhitneyu(tied1, tied2).pvalue]
out['mwu_big'] = [stats.mannwhitneyu(A, B).statistic, stats.mannwhitneyu(A, B).pvalue]
d_small = [0.5, -1.2, 2.3, 1.1, 3.4, -0.4, 2.8, 1.9]
d_tied = [1, -1, 2, 2, 3, -2, 4, 1, 3, 5, -1, 2]
out['wil_small'] = [stats.wilcoxon(d_small).statistic, stats.wilcoxon(d_small).pvalue]
out['wil_tied'] = [stats.wilcoxon(d_tied).statistic, stats.wilcoxon(d_tied).pvalue]
out['d_small'] = d_small; out['d_tied'] = d_tied
out['sign'] = stats.binomtest(sum(1 for v in d_tied if v > 0), sum(1 for v in d_tied if v != 0)).pvalue
out['kruskal'] = list(stats.kruskal(A, B, C))
out['kruskal_tied'] = list(stats.kruskal(tied1, tied2, small2))
M = np.round(rng.normal(0, 1, (10, 4)) + np.array([0, 0.5, 1, 0.8]), 2)
out['M'] = M.tolist()
out['friedman'] = list(stats.friedmanchisquare(*M.T))
x = np.array(A); y = x * 0.6 + rng.normal(0, 1, len(x))
out['xy'] = [x.tolist(), y.round(3).tolist()]
y = y.round(3)
pr2 = stats.pearsonr(x, y); pci = pr2.confidence_interval()
out['pearson'] = [pr2.statistic, pr2.pvalue, pci.low, pci.high]
out['spearman'] = list(stats.spearmanr(x, y))
out['kendall'] = list(stats.kendalltau(x, y))
out['kendall_tied'] = list(stats.kendalltau(tied1[:12], tied2[:12]))
# two-way (Type III, sum-to-zero coding) — an independent numpy computation; unbalanced
fa = rng.integers(0, 3, 40); fb = rng.integers(0, 2, 40)
yv = (fa * 1.0 + fb * 0.7 + (fa * fb) * 0.4 + rng.normal(0, 1, 40)).round(3)
def codes(f, n):
    return np.array([[1 if v == j else (-1 if v == n - 1 else 0) for j in range(n - 1)] for v in f])
Ac, Bc = codes(fa, 3), codes(fb, 2)
ABc = np.einsum('ij,ik->ijk', Ac, Bc).reshape(40, -1)
one = np.ones((40, 1))
def sse(X):
    beta, *_ = np.linalg.lstsq(X, yv, rcond=None)
    r = yv - X @ beta
    return float(r @ r)
full = sse(np.hstack([one, Ac, Bc, ABc]))
out['two'] = dict(y=yv.tolist(), fa=fa.tolist(), fb=fb.tolist(), ssA=sse(np.hstack([one, Bc, ABc])) - full, ssB=sse(np.hstack([one, Ac, ABc])) - full, ssAB=sse(np.hstack([one, Ac, Bc])) - full, sse=full)
# repeated measures: direct formulas and Mauchly with numpy
n, k = M.shape
gm = M.mean(); ssC = n * ((M.mean(0) - gm) ** 2).sum(); ssS = k * ((M.mean(1) - gm) ** 2).sum(); ssT = ((M - gm) ** 2).sum()
ssE = ssT - ssC - ssS; F = (ssC / (k - 1)) / (ssE / ((n - 1) * (k - 1)))
# Mauchly via orthonormal contrasts from QR of a centering basis
Cn = np.linalg.qr(np.vstack([np.ones(k), np.eye(k)[:-1]]).T)[0][:, 1:]
S = np.cov(M @ Cn, rowvar=False)
p = k - 1
W = np.linalg.det(S) / (np.trace(S) / p) ** p
eps = np.trace(S) ** 2 / (p * np.trace(S @ S))
out['rm'] = dict(F=F, p=stats.f.sf(F, k - 1, (n - 1) * (k - 1)), W=W, gg=eps, pgg=stats.f.sf(F, (k - 1) * eps, (n - 1) * (k - 1) * eps))
# the distributions
zs = [-8, -5, -3, -1.5, -0.3, 0, 0.2, 0.7, 1.96, 3.3, 6, 9]
dist = {}
dist['norm'] = [[z, stats.norm.cdf(z), stats.norm.sf(z)] for z in zs]
dist['normInv'] = [[p, stats.norm.ppf(p)] for p in [1e-10, 1e-4, 0.01, 0.025, 0.3, 0.5, 0.8, 0.975, 0.999]]
dist['t'] = [[t, nu, stats.t.cdf(t, nu), stats.t.sf(t, nu)] for t in [-12, -3, -1, 0.5, 2.2, 4, 30] for nu in [1, 2.5, 7, 30, 300]]
dist['tInv'] = [[p, nu, stats.t.ppf(p, nu)] for p in [0.001, 0.025, 0.5, 0.9, 0.995] for nu in [1, 3, 12, 100]]
dist['f'] = [[f, a, b, stats.f.sf(f, a, b)] for f in [0.1, 1, 2.5, 8, 40] for a in [1, 3, 10] for b in [2, 15, 120]]
dist['chi2'] = [[x, k, stats.chi2.sf(x, k)] for x in [0.01, 1, 5, 20, 80] for k in [1, 2, 5, 30]]
dist['tukey'] = [[q, k, df, stats.studentized_range.cdf(q, k, df)] for q in [0.5, 2, 3.5, 5, 7] for k in [2, 3, 5, 10] for df in [5, 20, 100]]
dist['binom'] = [[k, n, stats.binomtest(k, n).pvalue] for k, n in [(0, 5), (2, 10), (7, 10), (15, 40), (1, 1)]]
import os
json.dump({'hypo': out, 'dist': dist}, default=float, fp=open(os.path.join(os.path.dirname(__file__), 'stats-ref.json'), 'w'))
