# The reference values of npm run check for the Bar chart node (numpy / scipy / matplotlib):
# python -W ignore scripts/fixtures/bar-ref.py
import json, os
import numpy as np
from scipy import stats
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

rng = np.random.default_rng(5)
# raw values: 3 groups × 2 subgroups, 4 – 9 replicates each
groups, subs, vals = [], [], []
for g, mu in [('control', 10), ('drug A', 14), ('drug B', 8)]:
    for s, dm in [('day 1', 0), ('day 7', 3)]:
        n = int(rng.integers(4, 10))
        for v in rng.normal(mu + dm, 1.5, n):
            groups.append(g)
            subs.append(s)
            vals.append(float(v))
out = {'group': groups, 'sub': subs, 'value': vals, 'stats': {}}
for g in ['control', 'drug A', 'drug B']:
    for s in ['day 1', 'day 7']:
        v = np.array([x for x, gg, ss in zip(vals, groups, subs) if gg == g and ss == s])
        n = len(v)
        sd = v.std(ddof=1)
        out['stats'][f'{g}|{s}'] = {
            'n': n, 'mean': v.mean(), 'median': float(np.median(v)), 'sum': v.sum(), 'sd': sd, 'se': sd / np.sqrt(n),
            'ci95': stats.t.ppf(0.975, n - 1) * sd / np.sqrt(n), 'min': v.min(), 'max': v.max(),
            'q1': float(np.percentile(v, 25)), 'q3': float(np.percentile(v, 75)),
        }

# the rectangles matplotlib draws: grouped (centred offsets), stacked (negative values down), 100 %, horizontal
cats = np.arange(1, 5)
A = np.array([3.0, -2.0, 5.0, 1.0])
B = np.array([2.0, 4.0, -1.0, 3.0])
C = np.array([1.0, 1.0, 2.0, -2.0])
W = 0.8
def rects(bars):
    return [[float(p.get_x()), float(p.get_y()), float(p.get_width()), float(p.get_height())] for p in bars]
fig, ax = plt.subplots()
w = W / 3
g = [rects(ax.bar(cats + (j - 1) * w, v, w)) for j, v in enumerate([A, B, C])]
# stacked as Excel / Origin: the positive values up from 0, the negative ones down
up = np.zeros(4); down = np.zeros(4); st = []
for v in [A, B, C]:
    bottom = np.where(v >= 0, up, down)
    st.append(rects(ax.bar(cats, v, W, bottom=bottom)))
    up += np.where(v >= 0, v, 0); down += np.where(v < 0, v, 0)
tot = np.abs(A) + np.abs(B) + np.abs(C)
up = np.zeros(4); down = np.zeros(4); pc = []
for v in [A, B, C]:
    p = 100 * v / tot
    bottom = np.where(p >= 0, up, down)
    pc.append(rects(ax.bar(cats, p, W, bottom=bottom)))
    up += np.where(p >= 0, p, 0); down += np.where(p < 0, p, 0)
h = [rects(ax.barh(cats + (j - 1) * w, v, w)) for j, v in enumerate([A, B, C])]
out['bars'] = {'A': A.tolist(), 'B': B.tolist(), 'C': C.tolist(), 'grouped': g, 'stacked': st, 'percent': pc, 'barh': h}

with open(os.path.join(os.path.dirname(__file__), 'bar-ref.json'), 'w') as f:
    json.dump(out, f, default=float)
print('ok', len(vals), 'values')
