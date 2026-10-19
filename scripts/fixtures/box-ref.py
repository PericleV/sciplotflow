# The reference values of npm run check for the Box & violin node (matplotlib / scipy):
# python -W ignore scripts/fixtures/box-ref.py
import json, os
import numpy as np
from scipy import stats
from matplotlib import cbook

rng = np.random.default_rng(3)
data = {
    'normal': rng.normal(10, 2, 60).tolist(),
    'skewed': (rng.lognormal(1.5, 0.5, 45)).tolist(),
    'outliers': np.concatenate([rng.normal(5, 1, 40), [12, 13.5, -2]]).tolist(),
}
out = {'data': data, 'box': {}, 'violin': {}}
for name, x in data.items():
    x = np.array(x)
    out['box'][name] = {}
    for key, whis in [('iqr', 1.5), ('p5', (5, 95)), ('p10', (10, 90)), ('minmax', (0, 100))]:
        s = cbook.boxplot_stats(x, whis=whis, bootstrap=None)[0]
        out['box'][name][key] = {'q1': s['q1'], 'med': s['med'], 'q3': s['q3'], 'whislo': s['whislo'], 'whishi': s['whishi'], 'mean': s['mean'], 'cilo': s['cilo'], 'cihi': s['cihi'], 'fliers': sorted(s['fliers'].tolist())}
    # violins as matplotlib.violinplot: 100 points from the min to the max, Gaussian kernel (Scott, Silverman)
    for bw in ['scott', 'silverman']:
        v = cbook.violin_stats(x, lambda d, coords: stats.gaussian_kde(d, bw)(coords), points=100)[0]
        out['violin'].setdefault(name, {})[bw] = {'coords': v['coords'].tolist(), 'vals': v['vals'].tolist()}

with open(os.path.join(os.path.dirname(__file__), 'box-ref.json'), 'w') as f:
    json.dump(out, f, default=float)
print('ok', {k: out['box'][k]['iqr']['fliers'] for k in data})
