# The reference values of npm run check for the significance brackets (scipy): Welch t + Holm, Mann–Whitney, Tukey HSD
# python -W ignore scripts/fixtures/sig-ref.py
import json, os
import numpy as np
from scipy import stats

rng = np.random.default_rng(9)
g = [rng.normal(10, 2, 12), rng.normal(12.5, 2, 12), rng.normal(10.6, 2.5, 12)]
out = {'groups': [x.tolist() for x in g]}
pairs = [(0, 1), (0, 2), (1, 2)]


def holm(p):
    p = np.asarray(p)
    o = np.argsort(p)
    m = len(p)
    adj = np.empty(m)
    run = 0
    for k, i in enumerate(o):
        run = max(run, min(1, (m - k) * p[i]))
        adj[i] = run
    return adj.tolist()


out['welchHolm'] = holm([stats.ttest_ind(g[a], g[b], equal_var=False).pvalue for a, b in pairs])
out['mwNone'] = [stats.mannwhitneyu(g[a], g[b], alternative='two-sided').pvalue for a, b in pairs]
tk = stats.tukey_hsd(*g)
out['tukey'] = [tk.pvalue[a, b] for a, b in pairs]
with open(os.path.join(os.path.dirname(__file__), 'sig-ref.json'), 'w') as f:
    json.dump(out, f, default=float)
print('ok', out['welchHolm'], out['tukey'])
