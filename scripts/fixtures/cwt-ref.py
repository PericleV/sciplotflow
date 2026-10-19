# The reference values of npm run check for the Morlet scalogram: its definition (Torrence & Compo, a direct sum in
# NumPy) and PyWavelets' complex Morlet of the same shape (cmor2.0-w0/2pi).
# python -W ignore scripts/fixtures/cwt-ref.py
import json, numpy as np, pywt
dt = 0.01
n = 600
t = np.arange(n) * dt
x = np.sin(2 * np.pi * 8 * t) * (t < 3) + np.sin(2 * np.pi * 20 * t) * (t >= 3) + 0.3 * np.cos(2 * np.pi * 3 * t)
w0 = 6.0
scales = 0.01 * 2 ** (np.arange(40) / 6)
xm = x - x.mean()
# the definition (Torrence & Compo): W_n(s) = Î£ x_n' Ïˆ*((n' âˆ’ n)Î´t/s) âˆš(Î´t/s), Ïˆ(Î·) = Ï€^(âˆ’1/4) e^(iÏ‰0Î·) e^(âˆ’Î·Â²/2)
direct = []
for s in scales:
    k = np.arange(-n + 1, n)
    eta = k * dt / s
    psi = np.pi ** -0.25 * np.exp(1j * w0 * eta) * np.exp(-eta ** 2 / 2) * np.sqrt(dt / s)
    W = np.array([np.sum(xm * np.conj(psi[(np.arange(n) - i) + n - 1])) for i in range(n)])
    direct.append((np.abs(W) ** 2).tolist())
# PyWavelets: the complex Morlet of the same shape (bandwidth 2, centre Ï‰0/2Ï€), scales in samples
cw, fr = pywt.cwt(xm, scales / dt, f'cmor2.0-{w0 / (2 * np.pi)}', sampling_period=dt, method='fft')
# PyWavelets resamples its integrated wavelet at whole steps: exact at scales that are powers of 2 (in samples)
# on a signal with a tone at the frequency of every scale compared
p2 = np.array([16.0, 32.0, 64.0, 128.0])
t2 = np.arange(2048) * dt
x2 = sum(np.sin(2 * np.pi * (w0 + np.sqrt(2 + w0 * w0)) / (4 * np.pi * s * dt) * t2 + s) for s in p2)
cw2, _ = pywt.cwt(x2 - x2.mean(), p2, f'cmor2.0-{w0 / (2 * np.pi)}', sampling_period=dt, method='fft')
json.dump({'x2': x2.tolist(), 'p2': (p2 * dt).tolist(), 'pywt2': (np.abs(cw2) ** 2).tolist(), 'x': x.tolist(), 'dt': dt, 'scales': scales.tolist(), 'w0': w0, 'direct': direct, 'pywt': (np.abs(cw) ** 2).tolist(), 'pywtFreq': fr.tolist()}, open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'cwt-ref.json'), 'w'))
print('ok', pywt.__version__, fr[:3])
