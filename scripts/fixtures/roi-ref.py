# The reference values of npm run check for the selections of the Image analysis node (scikit-image regionprops,
# scipy, numpy, matplotlib for the pixels inside a polygon — their centres, as ImageJ):
# python -W ignore scripts/fixtures/roi-ref.py
# The gray image G of image-ref.json (20 × 24) measured under a few shapes.
import json, os
import numpy as np
from matplotlib.path import Path
from scipy import stats
from scipy.spatial import ConvexHull
from skimage.measure import regionprops

here = os.path.dirname(__file__)
G = np.array(json.load(open(os.path.join(here, 'image-ref.json')))['G'], dtype=np.float64)
H, W = G.shape
cy, cx = np.mgrid[0:H, 0:W] + 0.5


def turned(c, w, h, a):
    t = np.radians(a)
    return [(c[0] + u * np.cos(t) - v * np.sin(t), c[1] + u * np.sin(t) + v * np.cos(t)) for u, v in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]]


shapes = {
    'rect': {'kind': 'rect', 'box': [9.3, 8.1, 9.4, 6.6], 'angle': 0},
    'turned': {'kind': 'rect', 'box': [12.2, 10.3, 13.1, 5.4], 'angle': 30},
    'poly': {'kind': 'polygon', 'pts': [[2.2, 3.1], [15.7, 2.4], [18.3, 11.6], [9.1, 16.8], [4.4, 12.2], [7.6, 8.3]]},
}
out = {}
for name, s in shapes.items():
    pts = turned(s['box'][:2], s['box'][2], s['box'][3], s['angle']) if s['kind'] == 'rect' else s['pts']
    m = Path(pts).contains_points(np.c_[cx.ravel(), cy.ravel()]).reshape(H, W)
    v = G[m]
    p = regionprops(m.astype(np.uint8))[0]
    hull = ConvexHull(np.array(pts))
    hp = np.array(pts)[hull.vertices]
    feret = max(np.hypot(*(a - b)) for a in hp for b in hp)
    out[name] = {
        'roi': s,
        'n': int(m.sum()),
        'cx': float(cx[m].mean()),
        'cy': float(cy[m].mean()),
        'major': float(p.axis_major_length),
        'minor': float(p.axis_minor_length),
        'mean': float(v.mean()),
        'sd': float(v.std(ddof=1)),
        'median': float(np.median(v)),
        'skew': float(stats.skew(v)),
        'kurt': float(stats.kurtosis(v)),
        'hull': float(hull.volume),
        'feret': float(feret),
        'perimeter': float(sum(np.hypot(*(np.array(pts[i]) - np.array(pts[i - 1]))) for i in range(len(pts)))),
    }
json.dump(out, open(os.path.join(here, 'roi-ref.json'), 'w'), indent=1)
print('ok')
