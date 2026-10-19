# The reference values of npm run check for the Contour / heatmap node: contour lines (contourpy's serial algorithm, as matplotlib's;
# engine: the vertices of the lines of a level) and scattered points interpolated to a grid (scipy griddata, linear)
# python -W ignore scripts/fixtures/contour-ref.py
import json, os
import numpy as np
import contourpy
from scipy.interpolate import griddata

xs = np.linspace(0, 6, 31)
ys = np.linspace(-2, 3, 26)
X, Y = np.meshgrid(xs, ys)
Z = np.sin(X) * np.cos(Y) + 0.1 * X
out = {'xs': xs.tolist(), 'ys': ys.tolist(), 'z': Z.ravel().tolist(), 'levels': {}}
gen = contourpy.contour_generator(X, Y, Z, name='serial', line_type=contourpy.LineType.Separate)
for lv in [-0.5, 0.0, 0.4, 0.75]:
    lines = gen.lines(lv)
    out['levels'][str(lv)] = {'count': len(lines), 'points': sorted({(round(float(p[0]), 9), round(float(p[1]), 9)) for ln in lines for p in ln})}

rng = np.random.default_rng(13)
px, py = rng.uniform(0, 10, 300), rng.uniform(0, 5, 300)
pz = np.exp(-((px - 4) ** 2 + (py - 2.5) ** 2) / 4) + 0.05 * px
n = 40
gx = np.linspace(px.min(), px.max(), n)
gy = np.linspace(py.min(), py.max(), n)
GX, GY = np.meshgrid(gx, gy)
GZ = griddata((px, py), pz, (GX, GY), method='linear')
out['scatter'] = {'x': px.tolist(), 'y': py.tolist(), 'z': pz.tolist(), 'n': n, 'grid': [None if np.isnan(v) else v for v in GZ.ravel().tolist()]}
with open(os.path.join(os.path.dirname(__file__), 'contour-ref.json'), 'w') as f:
    json.dump(out, f)
print('ok', {k: v['count'] for k, v in out['levels'].items()}, int(np.isnan(GZ).sum()))
