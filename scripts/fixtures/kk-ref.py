# The reference of npm run check for the Lin-KK test of the Kramers–Kronig node (numpy; Schönleber et al. 2014, as
# impedance.py's linKK builds its model): python -W ignore scripts/fixtures/kk-ref.py
# A Randles circuit with 0.3 % noise; the fit of R0, M RC elements (time constants spread evenly in log over the
# frequencies), an inductance, every row divided by |Z|; of M = 1 … 50, the best fit with μ ≥ 0.85.
import json, os
import numpy as np

rng = np.random.default_rng(11)
f = 0.1 * 10 ** (np.arange(61) / 10)
w = 2 * np.pi * f
Z = 10 + 100 / (1 + 1j * w * 100 * 1e-5)
Z = Z + 0.003 * np.abs(Z) * (rng.standard_normal(61) + 1j * rng.standard_normal(61))
mod = np.abs(Z)
tmin, tmax = 1 / (2 * np.pi * f.max()), 1 / (2 * np.pi * f.min())
best = None
for M in range(1, 51):
    tau = np.array([tmin]) if M == 1 else tmin * (tmax / tmin) ** (np.arange(M) / (M - 1))
    Are = np.column_stack([np.ones_like(w)] + [1 / (1 + (w * t) ** 2) for t in tau] + [np.zeros_like(w)])
    Aim = np.column_stack([np.zeros_like(w)] + [-(w * t) / (1 + (w * t) ** 2) for t in tau] + [w])
    A = np.vstack([Are / mod[:, None], Aim / mod[:, None]])
    if np.linalg.matrix_rank(A) < A.shape[1]:
        break
    y = np.concatenate([Z.real / mod, Z.imag / mod])
    beta = np.linalg.lstsq(A, y, rcond=None)[0]
    R = beta[1:1 + M]
    mu = 1 - (-R[R < 0].sum()) / R[R >= 0].sum()
    fit = Are @ beta + 1j * (Aim @ beta)
    rre = 100 * (Z.real - fit.real) / mod
    rim = 100 * (Z.imag - fit.imag) / mod
    err = (rre ** 2).sum() + (rim ** 2).sum()
    if mu >= 0.85 and (best is None or err < best['err']):
        best = {'M': M, 'mu': float(mu), 'err': float(err), 'resRe': rre.tolist(), 'resIm': rim.tolist()}
json.dump({'f': f.tolist(), 're': Z.real.tolist(), 'im': Z.imag.tolist(), **best}, open(os.path.join(os.path.dirname(__file__), 'kk-ref.json'), 'w'))
print('ok', best['M'], best['mu'])
