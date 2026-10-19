# The reference values of npm run check for the spectral analysis (SciPy): Welch's PSD, the coherence, the spectrogram,
# the analytic signal, Butterworth and Chebyshev filters (second-order sections, causal and forward–backward), and the
# overlapping Allan deviation (its formula, NumPy).
# python -W ignore scripts/fixtures/spectral-ref.py
import json, os
import numpy as np
from scipy import signal

rng = np.random.default_rng(5)
fs = 100.0
n = 1000
t = np.arange(n) / fs
x = np.sin(2 * np.pi * 7 * t) + 0.5 * np.sin(2 * np.pi * 23 * t + 0.4) + 0.3 * rng.normal(size=n)
y = 0.8 * np.sin(2 * np.pi * 7 * t - 0.6) + 0.4 * rng.normal(size=n)
out = {'fs': fs, 'x': x.tolist(), 'y': y.tolist()}
f, p = signal.welch(x, fs, window='hann', nperseg=128, noverlap=64, detrend='constant', scaling='density')
out['welch'] = {'f': f.tolist(), 'p': p.tolist()}
f, p = signal.welch(x, fs, window='hamming', nperseg=100, noverlap=25, detrend='linear', scaling='spectrum')
out['welch2'] = {'f': f.tolist(), 'p': p.tolist()}
f, c = signal.coherence(x, y, fs, window='hann', nperseg=128, noverlap=64)
out['coh'] = {'f': f.tolist(), 'c': c.tolist()}
f, tt, S = signal.spectrogram(x, fs, window='hann', nperseg=64, noverlap=32, detrend='constant', scaling='density', mode='psd')
out['spec'] = {'f': f.tolist(), 't': tt.tolist(), 'S': S.T.tolist()}
z = signal.hilbert(x[:257])
out['hilbert'] = {'re': z.real.tolist(), 'im': z.imag.tolist()}
sos1 = signal.butter(4, 0.2, output='sos')
sos2 = signal.cheby1(3, 1, [0.1, 0.3], btype='bandpass', output='sos')
sos3 = signal.butter(5, 0.15, btype='highpass', output='sos')
sos4 = signal.cheby1(4, 0.5, [0.2, 0.4], btype='bandstop', output='sos')
out['filt'] = {
    'butter_low_ff': signal.sosfiltfilt(sos1, x).tolist(),
    'cheby_band_f': signal.sosfilt(sos2, x).tolist(),
    'butter_high_ff': signal.sosfiltfilt(sos3, x).tolist(),
    'cheby_stop_ff': signal.sosfiltfilt(sos4, x).tolist(),
}
# frequency responses at a few frequencies (|H|), independent of how the sections are paired
ws = np.array([0.05, 0.1, 0.2, 0.3, 0.5, 0.8]) * np.pi
out['resp'] = {k: np.abs(signal.sosfreqz(s, worN=ws)[1]).tolist() for k, s in [('b1', sos1), ('c2', sos2), ('b3', sos3), ('c4', sos4)]}
# Allan deviation (overlapping) of a rate: white noise plus a slow walk
r = 0.01 * rng.normal(size=4000) + np.cumsum(1e-5 * rng.normal(size=4000))
tau0 = 0.1
ph = np.concatenate([[0], np.cumsum(r) * tau0])
ad = []
for m in [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]:
    v = ph[2 * m:] - 2 * ph[m:-m] + ph[:-2 * m]
    ad.append([m * tau0, float(np.sqrt(np.sum(v * v) / (2 * len(v))) / (m * tau0))])
out['allan'] = {'rate': r.tolist(), 'tau0': tau0, 'ad': ad}
with open(os.path.join(os.path.dirname(__file__), 'spectral-ref.json'), 'w') as fh:
    json.dump(out, fh)
print('ok', len(out['welch']['f']), sos2.shape)
