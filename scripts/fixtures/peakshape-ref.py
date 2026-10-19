# The reference values of npm run check for the peak shapes (SciPy): the Faddeeva function w(z) over the upper half
# plane, the Voigt profile, and a Doniach–Šunjić line computed from its formula.
# python -W ignore scripts/fixtures/peakshape-ref.py
import json, os
import numpy as np
from scipy.special import wofz, voigt_profile

xs = [-200, -60, -12, -5, -2.5, -1, -0.3, 0, 0.2, 0.9, 1.7, 3, 6, 15, 40, 120, 400]
ys = [0, 1e-6, 0.01, 0.1, 0.5, 1, 2.5, 6, 20, 80, 300]
w = [[x, y, complex(wofz(complex(x, y))).real, complex(wofz(complex(x, y))).imag] for x in xs for y in ys]
grid = np.linspace(-12, 12, 97)
prof = {f'{s}_{g}': voigt_profile(grid, s, g).tolist() for s, g in [(1, 0.5), (0.3, 2), (2, 0.01), (0.01, 1)]}


def ds(x, xc, gamma, alpha):
    t = (xc - x) / gamma
    return np.cos(np.pi * alpha / 2 + (1 - alpha) * np.arctan(t)) / (1 + t * t) ** ((1 - alpha) / 2) / np.cos(np.pi * alpha / 2)


out = {'w': w, 'grid': grid.tolist(), 'prof': prof, 'ds': ds(grid, 0.5, 1.2, 0.2).tolist()}
with open(os.path.join(os.path.dirname(__file__), 'peakshape-ref.json'), 'w') as f:
    json.dump(out, f)
print('ok', len(w))
