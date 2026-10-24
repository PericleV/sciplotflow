# Reference values for src/engine/stat3.ts and statnodes3.ts (scripts/check-stat3.ts reads tests3-ref.json):
#   power and sample size (statsmodels TTestPower, TTestIndPower, FTestAnovaPower, NormalIndPower,
#   GofChisquarePower), the bootstrap and permutation tests (scipy.stats.bootstrap, permutation_test), distributions
#   fitted by maximum likelihood (scipy.stats *.fit, kstest), agreement (statsmodels cohens_kappa, fleiss_kappa;
#   pingouin intraclass_corr, cronbach_alpha), the logistic regression (statsmodels Logit). Lin's concordance,
#   Passing–Bablok, Deming and Hosmer–Lemeshow written here from their papers (Lin 1989; Passing and Bablok 1983;
#   Linnet 1993; Hosmer and Lemeshow, as R's ResourceSelection), as no library at hand does them right.
# Made with SciPy 1.18, statsmodels 0.15, pingouin 0.7 (a virtual environment: pip install scipy statsmodels pingouin).
import json, os, math
import numpy as np
import pandas as pd
from scipy import stats
from statsmodels.stats.power import TTestPower, TTestIndPower, FTestAnovaPower, NormalIndPower, GofChisquarePower
from statsmodels.stats.proportion import proportion_effectsize
from statsmodels.stats.inter_rater import cohens_kappa, fleiss_kappa, aggregate_raters
import statsmodels.api as sm
import pingouin as pg

rng = np.random.default_rng(20261025)
out = {}

# ---- power ----
out['power'] = {
    't2_n': TTestIndPower().solve_power(effect_size=0.5, power=0.8, alpha=0.05, ratio=1),
    't2_n_r2': TTestIndPower().solve_power(effect_size=0.4, power=0.9, alpha=0.05, ratio=2),
    't2_pow': TTestIndPower().power(effect_size=0.5, nobs1=30, alpha=0.05, ratio=1),
    't2_pow_one': TTestIndPower().power(effect_size=0.5, nobs1=30, alpha=0.05, ratio=1, alternative='larger'),
    't2_d': TTestIndPower().solve_power(nobs1=40, power=0.8, alpha=0.05, ratio=1),
    't1_pow': TTestPower().power(effect_size=0.3, nobs=50, alpha=0.05),
    'anova_pow': FTestAnovaPower().power(effect_size=0.25, nobs=4 * 30, alpha=0.05, k_groups=4),
    'prop_pow': NormalIndPower().power(effect_size=proportion_effectsize(0.45, 0.3), nobs1=100, alpha=0.05, ratio=1),
    'prop_n': NormalIndPower().solve_power(effect_size=proportion_effectsize(0.45, 0.3), power=0.8, alpha=0.05, ratio=1),
    'chi2_pow': GofChisquarePower().power(effect_size=0.3, nobs=100, alpha=0.05, n_bins=4),
    'corr_pow': stats.norm.sf(stats.norm.ppf(0.975) - math.atanh(0.3) * math.sqrt(80 - 3)) + stats.norm.cdf(-stats.norm.ppf(0.975) - math.atanh(0.3) * math.sqrt(80 - 3)),
    'lr_pow': stats.norm.sf(stats.norm.ppf(0.975) - math.sqrt(200 * 0.6 * 0.25) * abs(math.log(0.6))) + stats.norm.cdf(-stats.norm.ppf(0.975) - math.sqrt(200 * 0.6 * 0.25) * abs(math.log(0.6))),
}

# ---- bootstrap and permutation ----
a = rng.lognormal(1, 0.6, 30).round(3)
b = rng.lognormal(1.3, 0.6, 25).round(3)
bm = stats.bootstrap((a,), np.median, n_resamples=100000, method='BCa', random_state=np.random.default_rng(1))
bp = stats.bootstrap((a,), np.mean, n_resamples=100000, method='percentile', random_state=np.random.default_rng(2))
bd = stats.bootstrap((a, b), lambda x, y: np.mean(x) - np.mean(y), n_resamples=100000, method='BCa', random_state=np.random.default_rng(3))
sa, sb = a[:6], b[:5]
pt = stats.permutation_test((sa, sb), lambda x, y: np.mean(x) - np.mean(y), permutation_type='independent', n_resamples=np.inf, alternative='two-sided')
x7 = rng.normal(0, 1, 7).round(3); y7 = (0.6 * x7 + rng.normal(0, 1, 7)).round(3)
pc = stats.permutation_test((x7,), lambda u: stats.pearsonr(u, y7).statistic, permutation_type='pairings', n_resamples=np.inf, alternative='two-sided')
out['boot'] = {'a': a.tolist(), 'b': b.tolist(), 'med': [bm.confidence_interval.low, bm.confidence_interval.high, bm.standard_error], 'mean': [bp.confidence_interval.low, bp.confidence_interval.high, bp.standard_error],
               'diff': [bd.confidence_interval.low, bd.confidence_interval.high, bd.standard_error], 'perm': {'a': sa.tolist(), 'b': sb.tolist(), 'p': pt.pvalue, 'stat': pt.statistic},
               'pcorr': {'x': x7.tolist(), 'y': y7.tolist(), 'p': pc.pvalue, 'stat': pc.statistic}}

# ---- distributions ----
x = rng.weibull(1.8, 60) * 12 + 0.0
x = x.round(4)
fits = {}
m, s = stats.norm.fit(x); fits['normal'] = stats.norm.logpdf(x, m, s).sum()
sh, lo, sc = stats.lognorm.fit(x, floc=0); fits['lognormal'] = stats.lognorm.logpdf(x, sh, 0, sc).sum()
lo, sc = stats.expon.fit(x, floc=0); fits['exponential'] = stats.expon.logpdf(x, 0, sc).sum()
c, lo, sc = stats.weibull_min.fit(x, floc=0); fits['weibull'] = stats.weibull_min.logpdf(x, c, 0, sc).sum(); wb = [c, sc]
ga, lo, sc = stats.gamma.fit(x, floc=0); fits['gamma'] = stats.gamma.logpdf(x, ga, 0, sc).sum()
m2, s2 = stats.logistic.fit(x); fits['logistic'] = stats.logistic.logpdf(x, m2, s2).sum()
m3, s3 = stats.gumbel_r.fit(x); fits['gumbel'] = stats.gumbel_r.logpdf(x, m3, s3).sum()
u0, us = stats.uniform.fit(x); fits['uniform'] = stats.uniform.logpdf(x, u0, us).sum()
ks = stats.kstest(x, stats.norm(m, s).cdf, method='exact')
xs = np.sort(x); n = len(xs); F = stats.norm.cdf(xs, m, s); i = np.arange(1, n + 1)
ad = -n - np.sum((2 * i - 1) * (np.log(F) + np.log(1 - F[::-1]))) / n
pr = rng.beta(2.5, 4, 50).round(4)
ba, bb, _, _ = stats.beta.fit(pr, floc=0, fscale=1)
out['dist'] = {'x': x.tolist(), 'll': fits, 'weibull': wb, 'normal': [m, s], 'ks': [ks.statistic, ks.pvalue], 'ad': ad, 'beta': {'x': pr.tolist(), 'll': stats.beta.logpdf(pr, ba, bb).sum(), 'p': [ba, bb]},
               'kscdf': [[10, 0.274, 1 - stats.kstwo.sf(0.274, 10)], [25, 0.1, 1 - stats.kstwo.sf(0.1, 25)], [100, 0.137, 1 - stats.kstwo.sf(0.137, 100)], [400, 0.05, 1 - stats.kstwo.sf(0.05, 400)]]}

# ---- agreement ----
cats = ['mild', 'moderate', 'severe']
r1 = rng.choice(3, 60, p=[0.4, 0.35, 0.25])
r2 = np.where(rng.random(60) < 0.7, r1, rng.choice(3, 60))
r3 = np.where(rng.random(60) < 0.6, r1, rng.choice(3, 60))
t = pd.crosstab(r1, r2).reindex(index=range(3), columns=range(3), fill_value=0).values
kap = {}
for w in [None, 'linear', 'quadratic']:
    k = cohens_kappa(t) if w is None else cohens_kappa(t, wt=w)
    kap[str(w)] = [k.kappa, k.std_kappa, k.kappa_low, k.kappa_upp, k.z_value, k.pvalue_two_sided]
agg, _ = aggregate_raters(np.c_[r1, r2, r3])
out['kappa'] = {'r1': [cats[v] for v in r1], 'r2': [cats[v] for v in r2], 'r3': [cats[v] for v in r3], **kap, 'fleiss': fleiss_kappa(agg, method='fleiss')}
true = rng.normal(50, 10, 20)
M = np.c_[true + rng.normal(0, 3, 20), true + 2 + rng.normal(0, 3, 20), true - 1 + rng.normal(0, 4, 20), true + rng.normal(0, 3, 20)].round(2)
long = pd.DataFrame([(i, j, M[i, j]) for i in range(20) for j in range(4)], columns=['s', 'r', 'v'])
ic = pg.intraclass_corr(long, targets='s', raters='r', ratings='v')
items = np.c_[[true / 10 + rng.normal(0, 1, 20) for _ in range(5)]].T.round(2)
al = pg.cronbach_alpha(pd.DataFrame(items))[0]
k5, n5 = 5, 20
alo = 1 - (1 - al) * stats.f.isf(0.025, n5 - 1, (n5 - 1) * (k5 - 1))
ahi = 1 - (1 - al) * stats.f.isf(0.975, n5 - 1, (n5 - 1) * (k5 - 1))
def ccc(x, y):
    n = len(x); mx, my = x.mean(), y.mean(); sx2 = ((x - mx) ** 2).mean(); sy2 = ((y - my) ** 2).mean(); sxy = ((x - mx) * (y - my)).mean()
    c = 2 * sxy / (sx2 + sy2 + (mx - my) ** 2); r = sxy / math.sqrt(sx2 * sy2); u = (mx - my) / math.sqrt(math.sqrt(sx2 * sy2))
    v = (1 / (n - 2)) * ((1 - r ** 2) * c ** 2 / ((1 - c ** 2) * r ** 2) + 2 * c ** 3 * (1 - c) * u ** 2 / (r * (1 - c ** 2) ** 2) - c ** 4 * u ** 4 / (2 * r ** 2 * (1 - c ** 2) ** 2))
    z = stats.norm.ppf(0.975)
    return [c, math.tanh(math.atanh(c) - z * math.sqrt(v)), math.tanh(math.atanh(c) + z * math.sqrt(v))]
out['rel'] = {'M': M.tolist(), 'icc': ic[['ICC', 'F', 'df2', 'pval']].values.tolist(), 'ci': [list(v) for v in ic['CI95']], 'items': items.tolist(), 'alpha': [al, alo, ahi], 'ccc': ccc(M[:, 0], M[:, 1])}

# ---- method comparison (from the papers) ----
xm = np.sort(rng.uniform(2, 20, 40)).round(2)
ym = (0.5 + 1.06 * xm + rng.normal(0, 0.4, 40) * (1 + 0.05 * xm)).round(2)
def pb(x, y, level=0.95):
    n = len(x); S = []
    for i in range(n):
        for j in range(i + 1, n):
            dx, dy = x[j] - x[i], y[j] - y[i]
            if dx == 0 and dy == 0: continue
            s = np.inf * np.sign(dy) if dx == 0 else dy / dx
            if s == -1: continue
            S.append(s)
    S = np.sort(S); N = len(S); K = int((S < -1).sum())
    at = lambda i: S[min(N - 1, max(0, i - 1))]
    b = at((N + 1) // 2 + K) if N % 2 else 0.5 * (at(N // 2 + K) + at(N // 2 + 1 + K))
    C = stats.norm.ppf(1 - (1 - level) / 2) * math.sqrt(n * (n - 1) * (2 * n + 5) / 18)
    M1 = int(round((N - C) / 2)); M2 = N - M1 + 1
    lo, hi = at(M1 + K), at(M2 + K)
    return [b, lo, hi, np.median(y - b * x), np.median(y - hi * x), np.median(y - lo * x)]
def dem(x, y, lam=1.0):
    def f(x, y):
        mx, my = x.mean(), y.mean(); sxx = ((x - mx) ** 2).sum(); syy = ((y - my) ** 2).sum(); sxy = ((x - mx) * (y - my)).sum()
        b = (syy - lam * sxx + math.sqrt((syy - lam * sxx) ** 2 + 4 * lam * sxy ** 2)) / (2 * sxy)
        return b, my - b * mx
    b, a0 = f(x, y); n = len(x)
    J = np.array([f(np.delete(x, i), np.delete(y, i)) for i in range(n)])
    se = np.sqrt((n - 1) / n * ((J - J.mean(0)) ** 2).sum(0))
    return [b, a0, se[0], se[1]]
out['meth'] = {'x': xm.tolist(), 'y': ym.tolist(), 'pb': pb(xm, ym), 'deming': dem(xm, ym), 'deming2': dem(xm, ym, 2.0)}

# ---- the logistic regression ----
n = 150
df = pd.DataFrame({'age': rng.normal(55, 10, n).round(1), 'dose': rng.choice([0, 10, 20], n), 'sex': rng.choice(['F', 'M'], n)})
eta = -6 + 0.08 * df.age + 0.07 * df.dose + 0.6 * (df.sex == 'M')
df['y'] = np.where(rng.random(n) < 1 / (1 + np.exp(-eta)), 'yes', 'no')
X = sm.add_constant(pd.DataFrame({'age': df.age, 'dose': df.dose, 'sex[M]': (df.sex == 'M').astype(float)}))
lg = sm.Logit((df.y == 'yes').astype(float), X).fit(disp=0)
p = lg.predict(X).values; yy = (df.y == 'yes').astype(float).values
br = np.unique(np.quantile(p, np.linspace(0, 1, 11)))
grp = np.clip(np.searchsorted(br, p, side='left') - 1, 0, len(br) - 2)
hl = 0.0
for g in range(len(br) - 1):
    m = grp == g; o1 = yy[m].sum(); e1 = p[m].sum(); o0 = m.sum() - o1; e0 = m.sum() - e1
    hl += (o1 - e1) ** 2 / e1 + (o0 - e0) ** 2 / e0
out['logit'] = {'age': df.age.tolist(), 'dose': df.dose.tolist(), 'sex': df.sex.tolist(), 'y': df.y.tolist(), 'b': lg.params.tolist(), 'se': lg.bse.tolist(), 'p': lg.pvalues.tolist(), 'll': lg.llf, 'll0': lg.llnull, 'lr': lg.llr, 'pLR': lg.llr_pvalue,
                'mcfadden': lg.prsquared, 'aic': lg.aic, 'bic': lg.bic, 'hl': hl, 'hlDf': len(br) - 3, 'prob': p.tolist()}

with open(os.path.join(os.path.dirname(__file__), 'tests3-ref.json'), 'w') as fh:
    fh.write(json.dumps(out, indent=1, default=float).replace('NaN', 'null'))
print('ok')
