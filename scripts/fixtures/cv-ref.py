# References for the C-V structures of the Signal generator (scripts/check.ts), each computed apart from the app's
# algorithm: the MOS capacitor of CV_ideal.m (the band bending solved at every gate voltage by brentq; low frequency,
# and high frequency held below 2.10|u_B| + 1.33 kT/q), the exact high-frequency capacitance of Lindner (1962) and
# Brews (1974) (the linearized Poisson equation integrated in x on the equilibrium profile by solve_ivp), interface
# traps (their charge and capacitance by quad over the Fermi function) and the curve they make, the p-n junction
# (abrupt; linearly graded, its built-in voltage by brentq) and the Schottky diode (Sze & Ng, ch. 2 and 3), the SPICE
# junction capacitance, the ferroelectric capacitor of Miller et al. (1990), the semiconductor electrode with its
# Helmholtz layer (Poisson's equation, the potential split by brentq) and the Gouy-Chapman-Stern double layer (Bard &
# Faulkner, section 13.3; the potential split by brentq).
# Run: python scripts/fixtures/cv-ref.py  (numpy, scipy)
import json
import numpy as np
from scipy import integrate, optimize, special

k = 1.380649e-23; q = 1.602176634e-19; e0 = 8.8541878128e-12; me = 9.1093837015e-31; h = 6.62607015e-34; NA = 6.02214076e23
out = {}

def series(a, b):
    return 1 / (1 / a + 1 / b)

# e^v - 1 - v, by its series near 0 (where e^v - 1 - v loses its digits: the flat band)
def em1v(v):
    return v * v / 2 + v ** 3 / 6 + v ** 4 / 24 + v ** 5 / 120 if abs(v) < 1e-3 else np.expm1(v) - v

# ---- CV_ideal.m (n-type, V_FB = 0), with CODATA's q (the script has 1.6217657e-19) ----
T = 300.0; kT = k * T; phi = kT / q
eS = e0 * 9.7; A = 1e-6; ni = 5e-3; N = 1e22
Cox = e0 * 3.9 * A / 39.74e-9
lam_i = np.sqrt(eS * kT / (2 * q * q * ni)); lam_N = np.sqrt(eS * kT / (q * q * N)); C_FBS = eS / lam_N
uB = np.log(N / ni)
# 2(-v sinh u - cosh u + cosh(v + u)), written e^u(e^v - 1 - v) + e^-u(e^-v - 1 + v): the same, without the loss of digits
F = lambda v: np.exp(uB) * em1v(v) + np.exp(-uB) * em1v(-v)
VG = np.round(np.arange(-10, 10.0001, 0.02), 10)
BB = np.array([optimize.brentq(lambda v: V - phi * v + (A / Cox) * (eS * kT) / (q * lam_i) * np.sign(-v) * np.sqrt(F(v)), -200, 60, xtol=1e-14, rtol=1e-15) for V in VG])
def C_SLF(v):
    if v == 0: return A * C_FBS
    return A * np.sign(v) * eS / lam_i * ((np.exp(uB) * np.expm1(v) - np.exp(-uB) * np.expm1(-v)) / 2) / np.sqrt(F(v))
CL = lambda v: A * C_FBS if v == 0 else A / np.sqrt(2) * np.sign(v) * C_FBS * np.expm1(v) / np.sqrt(em1v(v))
vm = -(2.10 * abs(uB) + 1.33)
out['ideal'] = {
    'V': VG.tolist(),
    'lf': [series(Cox, C_SLF(v)) for v in BB],
    'hf': [series(Cox, CL(v) if v >= vm else CL(vm)) for v in BB],
    'Cox': Cox,
}

# ---- the exact high frequency: from the bulk to the surface in x (s = -x, in Debye lengths), the profile and dv ----
# G(v) = e^v - v - 1 + r(e^-v + v - 1); dv/ds = -+sqrt(2 G); d2(dv)/ds2 = e^v dv (the minority carriers frozen)
lnR = -2 * np.log(1e16 / 1e10)
r = np.exp(lnR)
G = lambda v: em1v(v) + r * em1v(-v)
def hf_exact(vs):
    sg = -1 if vs < 0 else 1
    v0 = sg * 1e-6
    a = -1 / (2 + np.sqrt(1 + r))
    y0 = [v0, 1.0, -(-1 + a * v0)]
    f = lambda s, y: [sg * np.sqrt(2 * max(G(y[0]), 0)), y[2], np.exp(y[0]) * y[1]]
    ev = lambda s, y: y[0] - vs
    ev.terminal = True
    sol = integrate.solve_ivp(f, [0, 200], y0, method='DOP853', rtol=1e-12, atol=1e-30, events=ev)
    v, d, dd = sol.y_events[0][0]
    return dd / d
vlist = [-60, -45, -35, -27.631021115928547, -20, -10, -5, -1, 2, 6]
out['hfx'] = {'lnR': lnR, 'v': vlist, 'C': [hf_exact(v) for v in vlist]}

# ---- interface traps: U-shaped over the gap (Si), donors below mid-gap, acceptors above ----
Eg = 1.12; g = Eg / 2
def D(e, dm, de, w):
    return dm + de * (np.exp((e - g) / w) + np.exp((-g - e) / w))
def trap_q(s, ph, dm, de, w):
    f = lambda e: special.expit(-(e - s) / ph)
    a = integrate.quad(lambda e: D(e, dm, de, w) * (1 - f(e)), -g, 0, points=[s] if -g < s < 0 else None, limit=800, epsabs=0, epsrel=1e-12)[0]
    b = integrate.quad(lambda e: D(e, dm, de, w) * f(e), 0, g, points=[s] if 0 < s < g else None, limit=800, epsabs=0, epsrel=1e-12)[0]
    return q * 1e4 * (a - b)
def trap_c(s, ph, dm, de, w):
    f = lambda e: special.expit(-(e - s) / ph)
    lo, hi = max(-g, s - 40 * ph), min(g, s + 40 * ph)
    if hi <= lo: return 0.0
    return q * 1e4 * integrate.quad(lambda e: D(e, dm, de, w) * f(e) * (1 - f(e)) / ph, lo, hi, points=[s] if lo < s < hi else None, limit=800, epsabs=0, epsrel=1e-12)[0]
slist = [-0.7, -0.5, -0.3, -0.1, 0, 0.15, 0.35, 0.5, 0.58, 0.8]
out['traps'] = {'s': slist, 'T': [300, 77], 'dit': [2e11, 1e13, 0.1],
                'Q': {str(t): [trap_q(s, k * t / q, 2e11, 1e13, 0.1) for s in slist] for t in [300, 77]},
                'C': {str(t): [trap_c(s, k * t / q, 2e11, 1e13, 0.1) for s in slist] for t in [300, 77]}}

# the curve they make: Si, n 1e16 cm-3, n_i 1e10, t_ox 20 nm, V_FB 0, 1 mm2, 300 K; at chosen band bendings
N = 1e22; eS = e0 * 11.7; phi = k * 300 / q
uB = np.log(N / 1e16); r = np.exp(-2 * uB)
Cox = e0 * 3.9 / 20e-9  # per m2
K = np.sqrt(2 * q * eS * N * phi); CD = np.sqrt(eS * q * N / phi)
Gm = lambda v, m: em1v(v) + (r * em1v(-v) if m else 0)
Gp = lambda v, m: np.expm1(v) + (-r * np.expm1(-v) if m else 0)
cs = lambda v, m: CD * abs(Gp(v, m)) / (np.sqrt(2) * np.sqrt(Gm(v, m)))
tc = {'V': [], 'lf': [], 'hf': []}
for psi in [-0.95, -0.8, -0.6, -0.45, -0.3, -0.2, -0.1, -0.03, 0.05, 0.1]:
    v = psi / phi
    Qs = -np.sign(v) * K * np.sqrt(Gm(v, True))
    s = phi * uB + psi
    tc['V'].append(psi - (Qs + trap_q(s, phi, 2e11, 1e13, 0.1)) / Cox)
    tc['lf'].append(1e-6 * series(Cox, cs(v, True) + trap_c(s, phi, 2e11, 1e13, 0.1)))
    tc['hf'].append(1e-6 * series(Cox, cs(max(v, -2 * uB), False)))
out['trapcurve'] = tc

# ---- p-n junction and Schottky diode (Si, 300 K, 1 mm2) ----
eS = e0 * 11.7; phi = k * 300 / q; ni = 1e16
V = np.round(np.arange(-5, 0.5001, 0.05), 10)
Nacc = 1e24; Nd = 1e22
vbi = phi * np.log(Nacc * Nd / ni ** 2)
neff = Nacc * Nd / (Nacc + Nd)
abrupt = [eS * 1e-6 / np.sqrt(2 * eS * (vbi - x - 2 * phi) / (q * neff)) if x < vbi - 2 * phi else None for x in V]
a = 1e28
vg = optimize.brentq(lambda vb: vb - 2 * phi * np.log(a * np.cbrt(12 * eS * vb / (q * a)) / (2 * ni)), 0.05, 5, xtol=1e-15)
graded = [eS * 1e-6 / np.cbrt(12 * eS * (vg - x) / (q * a)) if x < vg else None for x in V]
Nc = 2 * (2 * np.pi * 1.08 * me * k * 300 / h ** 2) ** 1.5
vbs = 0.8 - phi * np.log(Nc / 1e22)
schottky = [eS * 1e-6 / np.sqrt(2 * eS * (vbs - x - phi) / (q * 1e22)) if x < vbs - phi else None for x in V]
out['pn'] = {'V': V.tolist(), 'vbi': vbi, 'abrupt': abrupt, 'vbiGraded': vg, 'graded': graded, 'vbiSchottky': vbs, 'schottky': schottky}

# ---- SPICE junction capacitance; the ferroelectric capacitor (Miller et al. 1990) ----
V = np.round(np.arange(-10, 1.0001, 0.05), 10)
cj0, vj, mj, fc = 10e-12, 0.7, 0.4, 0.5
out['spice'] = {'V': V.tolist(), 'C': [cj0 * (1 - x / vj) ** -mj if x < fc * vj else cj0 / (1 - fc) ** (1 + mj) * (1 - fc * (1 + mj) + mj * x / vj) for x in V]}
V = np.round(np.arange(-8, 8.0001, 0.04), 10)
Ps, Pr, Ec, d, eb, Af = 0.30, 0.25, 5e6, 200e-9, 100, 1e-8
delta = Ec / np.log((1 + Pr / Ps) / (1 - Pr / Ps))
E = V / d
out['ferro'] = {'V': V.tolist(),
                'up': (Af * (e0 * eb + Ps / (2 * delta) / np.cosh((E - Ec) / (2 * delta)) ** 2) / d).tolist(),
                'down': (Af * (e0 * eb + Ps / (2 * delta) / np.cosh((E + Ec) / (2 * delta)) ** 2) / d).tolist(),
                'Pup': (100 * Ps * np.tanh((E - Ec) / (2 * delta))).tolist(), 'Pdown': (100 * Ps * np.tanh((E + Ec) / (2 * delta))).tolist()}

# ---- the semiconductor electrode: n-type TiO2-like (eps 31, 1e18 cm-3), E_fb -0.5 V, C_H 20 uF/cm2, 1 cm2, 298.15 K ----
T = 298.15; phi = k * T / q; N = 1e24; eS = e0 * 31; CH = 0.20; Ae = 1e-4
K = np.sqrt(2 * q * eS * N * phi); CD = np.sqrt(eS * q * N / phi)
Qsc = lambda p: -np.sign(p) * K * np.sqrt(em1v(p / phi))
Csc = lambda p: CD if p == 0 else CD * abs(np.expm1(p / phi)) / (np.sqrt(2) * np.sqrt(em1v(p / phi)))
Es = np.round(np.arange(-0.8, 1.5001, 0.025), 10)
ms = []
for Ev in Es:
    p = optimize.brentq(lambda p: -(p - Qsc(p) / CH) - (Ev + 0.5), -3, 0.6, xtol=1e-15, rtol=1e-15)
    ms.append(Ae * series(CH, Csc(p)))
out['ms'] = {'E': Es.tolist(), 'C': ms}

# ---- the Gouy-Chapman-Stern double layer: 0.01 M 1:1 in water (78.49), 298.15 K, C_H 20 uF/cm2, E_pzc 0, 1 cm2 ----
ew = e0 * 78.49; n0 = 0.01 * 1e3 * NA
cd0 = np.sqrt(2 * q * q * ew * n0 / (k * T)); s0 = np.sqrt(8 * ew * k * T * n0)
Es = np.round(np.arange(-0.4, 0.4001, 0.01), 10)
gc, gcs, phis = [], [], []
for Ev in Es:
    p = optimize.brentq(lambda p: p + s0 * np.sinh(p / (2 * phi)) / CH - Ev, -1, 1, xtol=1e-16, rtol=1e-15) if Ev != 0 else 0.0
    phis.append(p)
    gcs.append(Ae * series(CH, cd0 * np.cosh(p / (2 * phi))))
    gc.append(Ae * cd0 * np.cosh(Ev / (2 * phi)))
out['gcs'] = {'E': Es.tolist(), 'gc': gc, 'gcs': gcs, 'phi': phis}

with open(__file__.replace('.py', '.json'), 'w') as f:
    json.dump(out, f)
print('ok')
