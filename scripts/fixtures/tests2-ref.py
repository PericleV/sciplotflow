# Reference values for src/engine/stat2.ts and statnodes2.ts (scripts/check-stat2.ts reads tests2-ref.json):
#   p-values adjusted (statsmodels multipletests), contingency tables (scipy.stats: chi2_contingency, fisher_exact,
#   odds_ratio, relative_risk, association; statsmodels mcnemar), ROC (scikit-learn roc_auc_score, roc_curve; DeLong's
#   variance from its definition, Sun & Xu 2014), survival (lifelines KaplanMeierFitter, logrank_test,
#   multivariate_logrank_test with its weightings), the linear model (statsmodels OLS / WLS with formulas, anova_lm
#   Type II, variance_inflation_factor, het_breuschpagan, durbin_watson, OLSInfluence).
# Made with SciPy 1.18, statsmodels 0.15, lifelines 0.30, scikit-learn 1.9 (a virtual environment:
# pip install scipy statsmodels lifelines scikit-learn pandas).
import json, os
import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.contingency_tables import mcnemar
import statsmodels.formula.api as smf
import statsmodels.api as sm
from statsmodels.stats.anova import anova_lm
from statsmodels.stats.outliers_influence import variance_inflation_factor, OLSInfluence
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.stattools import durbin_watson
from sklearn.metrics import roc_auc_score, roc_curve
from lifelines import KaplanMeierFitter
from lifelines.statistics import logrank_test, multivariate_logrank_test

rng = np.random.default_rng(20261024)
out = {}

# ---- p-values adjusted ----
p = np.concatenate([rng.uniform(0, 0.05, 6), rng.uniform(0, 1, 14)]).round(5)
p[3] = p[7]  # (a tie)
out['padjust'] = {'p': p.tolist(), **{m: multipletests(p, method=sm_)[1].tolist() for m, sm_ in [('bonferroni', 'bonferroni'), ('holm', 'holm'), ('hochberg', 'simes-hochberg'), ('hommel', 'hommel'), ('bh', 'fdr_bh'), ('by', 'fdr_by')]}}

# ---- contingency tables ----
# Fisher's exact test of a 2 × c table by enumerating every first row with the same totals (SciPy's r × c test is a
# Monte Carlo estimate)
import itertools, math
from math import comb
def fisher2xc(t):
    t = np.array(t); cs = t.sum(0); r1 = t[0].sum(); n = t.sum()
    pr = lambda row: math.prod(comb(int(c), int(x)) for c, x in zip(cs, row)) / comb(int(n), int(r1))
    p0 = pr(t[0]); tot = 0.0
    for row in itertools.product(*[range(int(c) + 1) for c in cs]):
        if sum(row) == r1:
            q = pr(row)
            if q <= p0 * (1 + 1e-7): tot += q
    return tot
t = np.array([[23, 12, 9], [14, 19, 21]])
c = stats.chi2_contingency(t, correction=False)
g = stats.chi2_contingency(t, correction=False, lambda_='log-likelihood')
out['rxc'] = {'t': t.tolist(), 'chi2': c.statistic, 'df': int(c.dof), 'p': c.pvalue, 'G': g.statistic, 'pG': g.pvalue, 'fisher': fisher2xc(t), 'V': stats.contingency.association(t, method='cramer'), 'C': stats.contingency.association(t, method='pearson'), 'expected': c.expected_freq.tolist()}
t2 = np.array([[18, 7], [9, 16]])
c2 = stats.chi2_contingency(t2, correction=False)
y2 = stats.chi2_contingency(t2, correction=True)
orr = stats.contingency.odds_ratio(t2, kind='sample')
rr = stats.contingency.relative_risk(18, 25, 9, 25)
mc = mcnemar(np.array([[30, 12], [4, 20]]), exact=False, correction=True)
mce = mcnemar(np.array([[30, 12], [4, 20]]), exact=True)
small = np.array([[3, 1, 0], [0, 2, 4]])
out['two'] = {'t': t2.tolist(), 'chi2': c2.statistic, 'p': c2.pvalue, 'yates': y2.statistic, 'pYates': y2.pvalue, 'fisher': stats.fisher_exact(t2).pvalue, 'or': orr.statistic, 'orCI': list(orr.confidence_interval(0.95)), 'rr': rr.relative_risk, 'rrCI': list(rr.confidence_interval(0.95)), 'phi': stats.contingency.association(t2, method='cramer'),
              'mcnemar': {'t': [[30, 12], [4, 20]], 'stat': mc.statistic, 'p': mc.pvalue, 'exact': mce.pvalue}, 'small': {'t': small.tolist(), 'fisher': fisher2xc(small)}}
gof = np.array([30, 22, 28, 40])
out['gof'] = {'obs': gof.tolist(), 'exp': [0.25, 0.2, 0.25, 0.3], 'chi2': stats.chisquare(gof, np.array([0.25, 0.2, 0.25, 0.3]) * gof.sum()).statistic, 'p': stats.chisquare(gof, np.array([0.25, 0.2, 0.25, 0.3]) * gof.sum()).pvalue}

# ---- ROC ----
n1, n0 = 40, 55
y = np.r_[np.ones(n1), np.zeros(n0)]
s1 = np.r_[rng.normal(1.2, 1, n1), rng.normal(0, 1, n0)].round(2)  # (ties from the rounding)
s2 = (0.6 * s1 + rng.normal(0, 0.8, n1 + n0)).round(2)
def delong(pos, neg):
    psi = lambda x, z: 1.0 if x > z else (0.5 if x == z else 0.0)
    v10 = np.array([np.mean([psi(x, z) for z in neg]) for x in pos])
    v01 = np.array([np.mean([psi(x, z) for x in pos]) for z in neg])
    return v10, v01
def auc_se(pos, neg):
    v10, v01 = delong(pos, neg)
    return v10.mean(), np.sqrt(np.var(v10, ddof=1) / len(pos) + np.var(v01, ddof=1) / len(neg))
a1, se1 = auc_se(s1[:n1], s1[n1:])
a2, se2 = auc_se(s2[:n1], s2[n1:])
A10, A01 = delong(s1[:n1], s1[n1:])
B10, B01 = delong(s2[:n1], s2[n1:])
var = (np.var(A10, ddof=1) + np.var(B10, ddof=1) - 2 * np.cov(A10, B10)[0, 1]) / n1 + (np.var(A01, ddof=1) + np.var(B01, ddof=1) - 2 * np.cov(A01, B01)[0, 1]) / n0
z = (a1 - a2) / np.sqrt(var)
fpr, tpr, thr = roc_curve(y, s1, drop_intermediate=False)
j = np.argmax(tpr - fpr)
out['roc'] = {'y': y.tolist(), 's1': s1.tolist(), 's2': s2.tolist(), 'auc1': roc_auc_score(y, s1), 'auc2': roc_auc_score(y, s2), 'se1': se1, 'se2': se2, 'z': z, 'p': 2 * stats.norm.sf(abs(z)), 'fpr': fpr.tolist(), 'tpr': tpr.tolist(), 'youdenThr': float(thr[j]), 'youdenSens': float(tpr[j]), 'youdenSpec': float(1 - fpr[j])}

# ---- survival ----
def arm(n, scale, cens):
    t = rng.exponential(scale, n)
    c = rng.uniform(0, cens, n)
    return np.minimum(t, c).round(1), (t <= c).astype(int)
tA, eA = arm(30, 20, 40)
tB, eB = arm(28, 11, 40)
tC, eC = arm(25, 15, 40)
kmf = KaplanMeierFitter().fit(tA, eA)  # (log-log interval, lifelines's default)
sf = kmf.survival_function_.iloc[:, 0]
ci = kmf.confidence_interval_
from lifelines.utils import median_survival_times
mci = median_survival_times(kmf.confidence_interval_)
lr = logrank_test(tA, tB, eA, eB)
T = np.r_[tA, tB, tC]; E = np.r_[eA, eB, eC]; G = np.r_[np.zeros(30), np.ones(28), 2 * np.ones(25)]
mv = {w: multivariate_logrank_test(T, G, E, weightings=w).test_statistic for w in [None, 'wilcoxon', 'tarone-ware']}
# (the Mantel–Haenszel hazard ratio of B to A: exp((O − E) / V), from its definition)
def mh(t1, e1, t2, e2):
    tt = np.r_[t1, t2]; ee = np.r_[e1, e2]; gg = np.r_[np.zeros(len(t1)), np.ones(len(t2))]
    O = Ex = V = 0.0
    for u in np.unique(tt[ee == 1]):
        n = (tt >= u).sum(); n2 = ((tt >= u) & (gg == 1)).sum(); d = ((tt == u) & (ee == 1)).sum(); d2 = ((tt == u) & (ee == 1) & (gg == 1)).sum()
        O += d2; Ex += n2 * d / n
        if n > 1: V += d * (n - d) / (n - 1) * (n2 / n) * (1 - n2 / n)
    l = (O - Ex) / V
    return np.exp(l), np.exp(l - 1.959963984540054 / np.sqrt(V)), np.exp(l + 1.959963984540054 / np.sqrt(V))
hr = mh(tA, eA, tB, eB)
out['surv'] = {'tA': tA.tolist(), 'eA': eA.tolist(), 'tB': tB.tolist(), 'eB': eB.tolist(), 'tC': tC.tolist(), 'eC': eC.tolist(),
               'times': sf.index.tolist(), 'S': sf.tolist(), 'lo': ci.iloc[:, 0].tolist(), 'hi': ci.iloc[:, 1].tolist(),
               'median': float(kmf.median_survival_time_), 'medLo': float(mci.iloc[0, 0]), 'medHi': float(mci.iloc[0, 1]) if np.isfinite(mci.iloc[0, 1]) else None,
               'lr2': lr.test_statistic, 'p2': lr.p_value, 'lr3': mv[None], 'gehan3': mv['wilcoxon'], 'tarone3': mv['tarone-ware'], 'hr': list(hr)}

# ---- the linear model ----
n = 60
df = pd.DataFrame({'x1': rng.normal(5, 2, n).round(3), 'x2': rng.normal(0, 1, n).round(3), 'g': rng.choice(['ctrl', 'low', 'high'], n)})
df['y'] = (2 + 0.8 * df.x1 - 1.5 * df.x2 + df.g.map({'ctrl': 0, 'low': 1.2, 'high': 2.5}) + 0.3 * df.x1 * (df.g == 'high') + rng.normal(0, 1, n)).round(3)
df['s'] = rng.uniform(0.5, 1.5, n).round(3)
order = list(dict.fromkeys(df.g))  # (the levels as they first come: the first the reference)
f = f"y ~ x1 + x2 + C(g, Treatment(reference='{order[0]}'))"
m = smf.ols(f, df).fit()
X = m.model.exog
inf = OLSInfluence(m)
bp = het_breuschpagan(m.resid, X)
mi = smf.ols(f"y ~ (x1 + x2 + C(g, Treatment(reference='{order[0]}')))**2", df).fit()
mw = smf.wls(f, df, weights=1 / df.s ** 2).fit()
out['reg'] = {'data': {k: (df[k].tolist()) for k in ['x1', 'x2', 'g', 'y', 's']}, 'levels': order,
              'names': m.model.exog_names, 'b': m.params.tolist(), 'se': m.bse.tolist(), 't': m.tvalues.tolist(), 'p': m.pvalues.tolist(), 'ci': m.conf_int().values.tolist(),
              'r2': m.rsquared, 'adj': m.rsquared_adj, 'F': m.fvalue, 'pF': m.f_pvalue, 'aic': m.aic, 'bic': m.bic, 'dw': durbin_watson(m.resid), 'bp': bp[0], 'pbp': bp[1],
              'vif': [variance_inflation_factor(X, i) for i in range(1, X.shape[1])], 'lev': inf.hat_matrix_diag.tolist(), 'stud': inf.resid_studentized_internal.tolist(), 'cook': inf.cooks_distance[0].tolist(),
              'anova': anova_lm(m, typ=2)[['sum_sq', 'df', 'F']].values.tolist(),
              'inter': {'r2': mi.rsquared, 'anova': anova_lm(mi, typ=2)[['sum_sq', 'df', 'F']].values.tolist(), 'rows': list(anova_lm(mi, typ=2).index)},
              'wls': {'b': mw.params.tolist(), 'se': mw.bse.tolist(), 'r2': mw.rsquared, 'aic': mw.aic}}

with open(os.path.join(os.path.dirname(__file__), 'tests2-ref.json'), 'w') as fh:
    fh.write(json.dumps(out, indent=1, default=float).replace('NaN', 'null'))
print('ok')
