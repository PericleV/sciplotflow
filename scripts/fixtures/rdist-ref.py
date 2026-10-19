# Reference values for the studentized range, the noncentral t and Shapiro–Wilk (scripts/check.ts): scipy.stats
import json
from scipy import stats
tukey = [[q, k, df, float(stats.studentized_range.cdf(q, k, df))] for q, k, df in [(1.0, 3, 10), (3.5, 3, 10), (3.0, 4, 20), (5.0, 6, 12), (2.0, 2, 5), (4.5, 10, 30), (3.2, 5, 1000), (8.0, 3, 4), (0.5, 4, 60), (6.5, 8, 40)]]
nct = [[t, df, d, float(stats.nct.cdf(t, df, d))] for t, df, d in [(1.0, 10, 0.5), (-2.0, 5, 1.0), (3.0, 20, 2.0), (10.0, 8, 4.0), (0.0, 3, -1.5), (-5.0, 15, 0.3), (2.5, 2, 1.0), (25.0, 30, 20.0), (1.5, 500, 1.2)]]
import numpy as np
rng = np.random.default_rng(7)
sw = []
for n in [3, 4, 5, 6, 8, 11, 12, 20, 100, 1000]:
    x = rng.gamma(2.0, 1.0, n).round(6)
    r = stats.shapiro(x)
    sw.append([x.tolist(), float(r.statistic), float(r.pvalue)])
json.dump({'tukey': tukey, 'nct': nct, 'sw': sw}, open('scripts/fixtures/rdist-ref.json', 'w'), indent=1)
print('ok')
