# Reference values for src/engine/rmstats.ts (scripts/check.ts reads biostat-ref.json):
#   Dunnett (scipy.stats.dunnett), two-way ANOVA with a factor between and one within the subjects (pingouin.mixed_anova),
#   two-way with both factors within (statsmodels AnovaRM; pingouin.rm_anova for ε), the linear mixed model with a
#   random intercept, REML (statsmodels MixedLM) on data with missing values.
# Made with SciPy 1.18, statsmodels 0.15, pingouin 0.7, pandas 3.0 (a virtual environment: pip install scipy statsmodels pingouin).
import json, os
import numpy as np
import pandas as pd
from scipy import stats
import pingouin as pg
from statsmodels.stats.anova import AnovaRM
import statsmodels.formula.api as smf

rng = np.random.default_rng(20261017)
out = {}

# ---- Dunnett: a control and three treatments, unequal sizes ----
ctrl = rng.normal(10, 2, 8).round(3)
tr = [rng.normal(m, 2, n).round(3) for m, n in [(11, 7), (13, 8), (10.5, 6)]]
res = stats.dunnett(*tr, control=ctrl, rng=np.random.default_rng(1))
ci = res.confidence_interval(0.95)
# the probability behind it at high precision (scipy's multivariate t with 4 million points: ~1e-8), to check the
# integral itself (dunnett's own intervals use fewer points: ~1e-3)
from scipy.stats import multivariate_t
lam = np.sqrt(np.array([len(t) for t in tr]) / (np.array([len(t) for t in tr]) + len(ctrl)))
R = np.outer(lam, lam)
np.fill_diagonal(R, 1)
dfE = sum(len(t) for t in tr) + len(ctrl) - 4
cdf = [[c, float(multivariate_t(shape=R, df=dfE, seed=3).cdf(np.full(3, c), lower_limit=np.full(3, -c), maxpts=4_000_000))] for c in (1.5, 2.3, 2.6)]
out['dunnett'] = {'control': ctrl.tolist(), 'treat': [t.tolist() for t in tr], 't': res.statistic.tolist(), 'p': res.pvalue.tolist(), 'lo': ci.low.tolist(), 'hi': ci.high.tolist(), 'lam': lam.tolist(), 'df': dfE, 'cdf': cdf}

# ---- mixed design: 2 groups (between) × 4 times (within), unequal group sizes ----
rows = []
sid = 0
for g, n in [('ctrl', 7), ('drug', 9)]:
    for s in range(n):
        base = rng.normal(0, 1.5)
        for t in range(4):
            eff = 0.6 * t + (0.8 * t if g == 'drug' else 0)
            rows.append({'subject': f's{sid}', 'group': g, 'time': f't{t}', 'y': round(10 + base + eff + rng.normal(0, 0.8 + 0.3 * t), 3)})
        sid += 1
md = pd.DataFrame(rows)
ma = pg.mixed_anova(data=md, dv='y', within='time', between='group', subject='subject', correction=True)
# Greenhouse–Geisser ε as SPSS's GLM gives it for a split plot: the covariance of the contrasts pooled within the
# groups (pingouin's ε above takes the subjects together, ignoring the groups)
def helm1(k):
    H = np.array([[1 if i <= j else (-(j + 1) if i == j + 1 else 0) for i in range(k)] for j in range(k - 1)], dtype=float)
    return H / np.linalg.norm(H, axis=1, keepdims=True)
wide = md.pivot(index='subject', columns='time', values='y')
grp = md.groupby('subject')['group'].first().loc[wide.index]
Yc = wide.to_numpy() @ helm1(4).T
dev = np.vstack([Yc[(grp == g).to_numpy()] - Yc[(grp == g).to_numpy()].mean(axis=0) for g in grp.unique()])
Sp = dev.T @ dev / (len(wide) - grp.nunique())
ggPooled = float(np.trace(Sp) ** 2 / (Sp.shape[0] * np.trace(Sp @ Sp)))
# unequal groups: the factor within and the interaction by Type III sums of squares (as SPSS's GLM and Prism; pingouin's
# sums for the factor within are weighted — Type II), by least squares with a column per subject (numpy)
def sumcode(levels, l):
    k = len(levels)
    return [1.0 if l == levels[j] else (-1.0 if l == levels[-1] else 0.0) for j in range(k - 1)]
subs = list(dict.fromkeys(md.subject))
tl, gl = sorted(md.time.unique()), list(dict.fromkeys(md.group))
D = np.array([[1.0 if r.subject == s else 0.0 for s in subs] for r in md.itertuples()])
Bc = np.array([sumcode(tl, r.time) for r in md.itertuples()])
ABc = np.array([np.outer(sumcode(gl, r.group), sumcode(tl, r.time)).ravel() for r in md.itertuples()])
yv = md.y.to_numpy()
def rss(X):
    b, *_ = np.linalg.lstsq(X, yv, rcond=None)
    return float(((yv - X @ b) ** 2).sum())
full = rss(np.hstack([D, Bc, ABc]))
type3 = {'B': rss(np.hstack([D, ABc])) - full, 'AB': rss(np.hstack([D, Bc])) - full, 'error': full}
# equal groups (8 and 8): every kind of sums the same; pingouin
balanced = md[md.subject.isin([s for s in subs if s not in ('s14', 's15')])]
mb = pg.mixed_anova(data=balanced, dv='y', within='time', between='group', subject='subject', correction=True)
out['mixedDesign'] = {'data': rows, 'table': ma.to_dict(orient='records'), 'ggPooled': ggPooled, 'type3': type3, 'balanced': mb.to_dict(orient='records')}

# ---- both within: 3 conditions × 3 times, 10 subjects ----
rows2 = []
for s in range(10):
    base = rng.normal(0, 1)
    for a in range(3):
        for b in range(3):
            rows2.append({'subject': f'p{s}', 'A': f'a{a}', 'B': f'b{b}', 'y': round(5 + base + 0.5 * a + 0.3 * b + 0.2 * a * b + rng.normal(0, 0.5 + 0.2 * a), 3)})
bw = pd.DataFrame(rows2)
arm = AnovaRM(bw, 'y', 'subject', within=['A', 'B']).fit().anova_table
# Greenhouse–Geisser ε of each factor (pingouin, on the means over the other factor) and of the interaction (its
# orthonormal contrasts: the Kronecker product of Helmert contrasts, the covariance of the subjects' contrasts)
epsA = pg.epsilon(bw.groupby(['subject', 'A'], as_index=False)['y'].mean(), dv='y', within='A', subject='subject', correction='gg')
epsB = pg.epsilon(bw.groupby(['subject', 'B'], as_index=False)['y'].mean(), dv='y', within='B', subject='subject', correction='gg')
def helm(k):
    return np.array([[1 if i <= j else (-(j + 1) if i == j + 1 else 0) for i in range(k)] for j in range(k - 1)], dtype=float) / np.sqrt([[sum((1 if i <= j else (-(j + 1) if i == j + 1 else 0)) ** 2 for i in range(k))] for j in range(k - 1)])
Ck = np.kron(helm(3), helm(3))
Y = np.array([[bw[(bw.subject == s) & (bw.A == f'a{a}') & (bw.B == f'b{b}')].y.iloc[0] for a in range(3) for b in range(3)] for s in sorted(bw.subject.unique(), key=lambda x: int(x[1:]))]) @ Ck.T
S = np.cov(Y, rowvar=False)
epsAB = float(np.trace(S) ** 2 / (S.shape[0] * np.trace(S @ S)))
out['bothWithin'] = {'data': rows2, 'F': arm['F Value'].tolist(), 'df1': arm['Num DF'].tolist(), 'df2': arm['Den DF'].tolist(), 'p': arm['Pr > F'].tolist(), 'gg': [float(epsA), float(epsB), epsAB]}

# ---- the mixed model (REML, a random intercept per subject): the mixed design with some values missing ----
mm = md.drop(index=[3, 10, 11, 37, 50]).reset_index(drop=True)
fit = smf.mixedlm('y ~ C(group, Sum) * C(time, Sum)', mm, groups=mm['subject']).fit(reml=True)
out['mixedModel'] = {'data': mm.to_dict(orient='records'), 'beta': fit.fe_params.tolist(), 'names': list(fit.fe_params.index), 'sigmaU2': float(fit.cov_re.iloc[0, 0]), 'sigmaE2': float(fit.scale), 'llf': float(fit.llf)}

def clean(v):
    if isinstance(v, float) and not np.isfinite(v):
        return None
    if isinstance(v, (np.floating,)):
        return clean(float(v))
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, dict):
        return {k: clean(x) for k, x in v.items()}
    if isinstance(v, list):
        return [clean(x) for x in v]
    return v

with open(os.path.join(os.path.dirname(__file__), 'biostat-ref.json'), 'w') as f:
    json.dump(clean(out), f, indent=1)
print('written', {k: (len(v['data']) if 'data' in v else 'ok') for k, v in out.items()})
