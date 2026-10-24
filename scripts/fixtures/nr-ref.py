# Reference values for the incomplete beta and gamma functions (scipy.special betainc, gammainc and their complements)
# and the eigenvalues of non-symmetric matrices (numpy.linalg.eigvals), for src/engine/dist.ts and src/engine/matrix.ts.
# python scripts/fixtures/nr-ref.py (from the project folder)
import json, numpy as np
from scipy import special
cases_b = [(0.5, 0.5, 0.3), (2, 3, 0.4), (10, 0.5, 0.99), (0.1, 50, 1e-4), (300, 200, 0.6), (5, 5, 0.5), (1.5, 1e3, 1e-3)]
cases_g = [(0.5, 0.01), (0.5, 25), (3, 2), (10, 30), (100, 90), (0.1, 5), (50, 1e-3)]
ib = [[a, b, x, float(special.betainc(a, b, x)), float(special.betaincc(a, b, x))] for a, b, x in cases_b]
ig = [[a, x, float(special.gammainc(a, x)), float(special.gammaincc(a, x))] for a, x in cases_g]
A = np.array([[4, -2, 1, 0.5], [3, 6, -4, 2], [2, 1, 8, -3], [-1, 5, 2, 1]], float)
B = np.array([[1, 1e6, 0], [1e-6, 2, 1e3], [0, 1e-3, 3]], float)
def ev(M):
    w = np.linalg.eigvals(M)
    w = sorted(w, key=lambda z: (z.real, -z.imag))
    return [[float(z.real), float(z.imag)] for z in w]
json.dump({'ibeta': ib, 'igamma': ig, 'A': A.tolist(), 'eigA': ev(A), 'B': B.tolist(), 'eigB': ev(B)}, open('scripts/fixtures/nr-ref.json', 'w'), indent=1)
print('ok')
