# The reference values of npm run check for the matrix nodes (src/engine/matrix.ts): numpy.linalg and scipy.linalg on
# a few matrices — general, symmetric positive definite, rectangular, rank-deficient, with real eigenvalues, Hilbert.
# python -W ignore scripts/fixtures/matrix-ref.py
import json, os
import numpy as np
import scipy.linalg as sl

rng = np.random.default_rng(7)
G = rng.normal(size=(4, 4))  # general (complex eigenvalues)
M = rng.normal(size=(5, 5))
S = M @ M.T + 5 * np.eye(5)  # symmetric positive definite
R = rng.normal(size=(5, 3))  # rectangular
W = rng.normal(size=(3, 5))  # wide
D = np.outer([1, 2, 3, 4], [1, 0.5, -1, 2]) + np.outer([0, 1, 0, 1], [1, 1, 1, 1])  # rank 2
T = np.triu(rng.normal(size=(4, 4))) + np.diag([0, 1, 2, 3]) * 2 + 0.05 * rng.normal(size=(4, 4))  # real eigenvalues
H = sl.hilbert(5)
b = rng.normal(size=(4, 2))
bR = rng.normal(size=(5, 1))

flat = lambda a: np.asarray(a, dtype=float).ravel().tolist()
mat = lambda a: {'rows': int(np.shape(a)[0]), 'cols': int(np.shape(a)[1]), 'v': flat(a)}
out = {'G': mat(G), 'S': mat(S), 'R': mat(R), 'W': mat(W), 'D': mat(D), 'T': mat(T), 'H': mat(H), 'b': mat(b), 'bR': mat(bR)}

P, L, U = sl.lu(G)
Q, Rq = np.linalg.qr(G)
QR_, RR_ = np.linalg.qr(R)
ev = np.linalg.eigvals(G)
ev = sorted(ev, key=lambda z: (z.real, -z.imag))
wS, VS = np.linalg.eigh(S)
wT, VT = np.linalg.eig(T)
o = np.argsort(wT.real)
wT, VT = wT.real[o], VT.real[:, o]
out['ref'] = {
    'G': {
        'det': float(np.linalg.det(G)), 'inv': flat(np.linalg.inv(G)), 'solve': flat(np.linalg.solve(G, b)),
        'P': flat(P), 'L': flat(L), 'U': flat(U), 'Q': flat(Q), 'R': flat(Rq),
        'eig_re': [float(z.real) for z in ev], 'eig_im': [float(z.imag) for z in ev],
        's': flat(np.linalg.svd(G, compute_uv=False)), 'pinv': flat(np.linalg.pinv(G)), 'rank': int(np.linalg.matrix_rank(G)),
        'fro': float(np.linalg.norm(G, 'fro')), 'n1': float(np.linalg.norm(G, 1)), 'ninf': float(np.linalg.norm(G, np.inf)), 'n2': float(np.linalg.norm(G, 2)),
        'cond': float(np.linalg.cond(G)), 'pow3': flat(np.linalg.matrix_power(G, 3)), 'powm2': flat(np.linalg.matrix_power(G, -2)),
        'kron': flat(np.kron(G[:2, :2], np.array([[1, 2], [3, 4]]))), 'trace': float(np.trace(G)),
    },
    'S': {'eigh_w': flat(wS), 'eigh_V': flat(VS), 'chol': flat(np.linalg.cholesky(S)), 'det': float(np.linalg.det(S))},
    'R': {'Q': flat(QR_), 'R': flat(RR_), 's': flat(np.linalg.svd(R, compute_uv=False)), 'pinv': flat(np.linalg.pinv(R)), 'lstsq': flat(np.linalg.lstsq(R, bR, rcond=None)[0]), 'rank': int(np.linalg.matrix_rank(R))},
    'W': {'s': flat(np.linalg.svd(W, compute_uv=False)), 'pinv': flat(np.linalg.pinv(W))},
    'D': {'rank': int(np.linalg.matrix_rank(D)), 'pinv': flat(np.linalg.pinv(D)), 's': flat(np.linalg.svd(D, compute_uv=False))},
    'T': {'w': flat(wT), 'V': flat(VT)},
    'H': {'cond': float(np.linalg.cond(H)), 'inv': flat(np.linalg.inv(H))},
    'vander': flat(np.vander([1.0, 2.0, 3.0, 4.0])),
}
with open(os.path.join(os.path.dirname(__file__), 'matrix-ref.json'), 'w') as f:
    json.dump(out, f)
print('ok', out['ref']['G']['eig_im'], out['ref']['D']['rank'])
