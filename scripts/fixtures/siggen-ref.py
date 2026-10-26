# References for the Signal generator (scripts/check.ts): scipy's chirp, square and sawtooth, the Voigt profile, and the
# ideal C-V curve of a MOS capacitor by the algorithm of razvan_CV_ideal_test.m (the majority carriers only, a dense
# grid of the surface potential read at the gate sweep), with CODATA constants.
# Run: python scripts/fixtures/siggen-ref.py  (numpy, scipy)
import json
import numpy as np
from scipy import signal, special

out = {}
t = np.linspace(0, 10, 201)
out['t'] = t.tolist()
out['chirp'] = {m: signal.chirp(t, f0=1, t1=10, f1=10, method=m).tolist() for m in ['linear', 'quadratic', 'logarithmic', 'hyperbolic']}
out['square'] = signal.square(2 * np.pi * 0.7 * t, duty=0.3).tolist()
out['sawtooth'] = signal.sawtooth(2 * np.pi * 0.7 * t, width=1).tolist()
out['triangle'] = signal.sawtooth(2 * np.pi * 0.7 * t, width=0.5).tolist()
x = np.linspace(0, 10, 101)
s = 1 / (2 * np.sqrt(2 * np.log(2)))
v = special.voigt_profile(x - 5, s, 0.25)
out['voigt'] = (v / special.voigt_profile(0, s, 0.25)).tolist()

# C-V (deep depletion): the parameters of the scripts
k = 1.380649e-23; q = 1.602176634e-19; e0 = 8.8541878128e-12
e_ox = 3.9; e_s = 9.66; A = 1e-6; N_D = 1e22; t_ox = 14e-9; V_FB = 1.0
C_ox = e0 * e_ox * A / t_ox
V = np.linspace(-10, 10, 201)
cv = {}
for T in [14, 300]:
    phi = k * T / q
    psi = np.linspace(-15, min(2, 700 * phi), 200001)
    psi[np.abs(psi) < 1e-7] = 1e-7
    F = np.abs(phi * np.exp(psi / phi) - psi - phi)
    F[F < 1e-25] = 1e-25
    Q = -np.sign(psi) * np.sqrt(2 * q * e_s * e0 * N_D) * np.sqrt(F)
    Cs = np.abs(np.sqrt(q * e_s * e0 * N_D / 2) * (1 - np.exp(psi / phi)) / np.sqrt(F)) * A
    VG = V_FB + psi - Q * A / C_ox
    C = 1 / (1 / C_ox + 1 / Cs)
    o = np.argsort(VG)
    VGu, idx = np.unique(VG[o], return_index=True)
    cv[str(T)] = np.interp(V, VGu, C[o][idx], left=np.nan, right=np.nan).tolist()
out['cv'] = {'V': V.tolist(), 'C': cv, 'Cox': C_ox}

with open(__file__.replace('.py', '.json'), 'w') as f:
    json.dump(out, f)
print('ok')
