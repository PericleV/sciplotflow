# The reference values of npm run check for the signal processing (scipy / numpy): python -W ignore scripts/fixtures/signal-ref.py
import json, os
import numpy as np
from scipy import ndimage, signal, interpolate

rng = np.random.default_rng(7)
n = 101
x = np.linspace(0, 10, n)
y = np.sin(x) + 0.3 * np.sin(5 * x) + 0.2 * rng.normal(size=n)
out = {'x': x.tolist(), 'y': y.tolist()}

out['avg'] = {m: ndimage.uniform_filter1d(y, 7, mode=m).tolist() for m in ['reflect', 'nearest', 'mirror']}
out['avg6'] = ndimage.uniform_filter1d(y, 6, mode='reflect').tolist()
out['gauss'] = {m: ndimage.gaussian_filter1d(y, 2.5, mode=m, truncate=4.0).tolist() for m in ['reflect', 'nearest', 'mirror']}
out['median'] = {m: ndimage.median_filter(y, 5, mode=m).tolist() for m in ['reflect', 'nearest', 'mirror']}
out['savgol'] = {m: signal.savgol_filter(y, 11, 3, mode=m).tolist() for m in ['interp', 'mirror', 'nearest']}

# LOWESS (Cleveland 1979) written independently: the k nearest points by sorting the distances
xl = np.sort(rng.uniform(0, 10, 80))
yl = np.sin(xl) + 0.3 * rng.normal(size=80)
def lowess_ref(x, y, frac, it):
    n = len(x)
    k = int(frac * n + 1e-10)
    rob = np.ones(n)
    for r in range(it + 1):
        fit = np.empty(n)
        for i in range(n):
            d = np.abs(x - x[i])
            idx = np.argsort(d, kind='stable')[:k]
            h = d[idx].max()
            u = d[idx] / h if h > 0 else np.zeros(k)
            w = np.where(u < 1, (1 - u ** 3) ** 3, 0) * rob[idx]
            X = np.vstack([np.ones(k), x[idx]]).T
            W = np.diag(w)
            beta = np.linalg.solve(X.T @ W @ X, X.T @ W @ y[idx])
            fit[i] = beta[0] + beta[1] * x[i]
        if r == it:
            break
        res = np.abs(y - fit)
        s = np.median(res)
        u = res / (6 * s)
        rob = np.where(u < 1, (1 - u ** 2) ** 2, 0)
    return fit
out['lowess'] = {'x': xl.tolist(), 'y': yl.tolist(), 'fit': lowess_ref(xl, yl, 0.3, 3).tolist()}

# the FFT: an even length (radix 2 after padding not used) and a prime length (Bluestein)
for m in [100, 97, 64]:
    v = y[:m]
    F = np.fft.fft(v)
    out[f'fft{m}'] = {'re': F.real.tolist(), 'im': F.imag.tolist()}
# the spectrum: Hann window, mean removed, one-sided amplitude corrected for the window
v = y[:100] - y[:100].mean()
w = np.hanning(100)
F = np.fft.rfft(v * w)
amp = np.abs(F) / 100 / (w.sum() / 100)
amp[1:-1] *= 2
out['spec'] = {'f': np.fft.rfftfreq(100, x[1] - x[0]).tolist(), 'amp': amp.tolist()}
# the FFT filter (no mirroring): ideal low pass and Butterworth-shaped band stop
def fft_filter(v, dx, H):
    F = np.fft.fft(v)
    f = np.abs(np.fft.fftfreq(len(v), dx))
    return np.real(np.fft.ifft(F * H(f)))
dx = x[1] - x[0]
out['lowpass'] = fft_filter(y, dx, lambda f: (f <= 1.0).astype(float)).tolist()
lp = lambda f, fc, o: 1 / np.sqrt(1 + (f / fc) ** (2 * o))
out['bandstop'] = fft_filter(y, dx, lambda f: 1 - lp(f, 1.2, 3) * (1 - lp(f, 0.6, 3))).tolist()

# interpolation (scipy), inside and outside the data
xi = np.array([0.0, 0.7, 1.5, 2.2, 3.9, 4.0, 5.3, 6.1, 7.7, 9.0])
yi = np.array([1.0, 1.8, 0.4, 0.9, 2.5, 2.4, 1.1, 1.2, 3.0, 2.0])
q = np.array([-0.5, 0.2, 1.0, 2.0, 3.95, 4.5, 6.0, 7.0, 8.8, 9.6])
out['interp'] = {
    'x': xi.tolist(), 'y': yi.tolist(), 'q': q.tolist(),
    'spline': interpolate.CubicSpline(xi, yi, bc_type='natural', extrapolate=True)(q).tolist(),
    'akima': interpolate.Akima1DInterpolator(xi, yi, extrapolate=True)(q).tolist(),
    'pchip': interpolate.PchipInterpolator(xi, yi, extrapolate=True)(q).tolist(),
    'linear': np.interp(q, xi, yi).tolist(),
}

# convolution (zero ends, as numpy 'same'), Wiener and Richardson–Lucy written independently
k = np.exp(-4 * np.log(2) * (np.arange(-9, 10) / 4.0) ** 2)
k /= k.sum()
pos = np.abs(y) + 0.5
out['kernel'] = k.tolist()
out['conv'] = np.convolve(y, k, mode='same').tolist()
def wiener_ref(v, k, lam):
    pad = max(len(k), len(v) // 2)
    vp = np.pad(v, pad, mode='symmetric')
    N = len(vp)
    kk = np.zeros(N)
    h = (len(k) - 1) // 2
    for j, wv in enumerate(k):
        kk[(j - h) % N] = wv
    Y = np.fft.fft(vp)
    K = np.fft.fft(kk)
    X = Y * np.conj(K) / (np.abs(K) ** 2 + lam * np.max(np.abs(K) ** 2))
    return np.real(np.fft.ifft(X))[pad:pad + len(v)]
out['wiener'] = wiener_ref(np.convolve(pos, k, mode='same'), k, 1e-3).tolist()
def rl_ref(v, k, iters):
    u = np.maximum(v, 0)
    kf = k[::-1]
    for _ in range(iters):
        c = ndimage.convolve(u, k, mode='reflect')
        ratio = np.where(c > 1e-300, v / c, 0)
        u = u * ndimage.convolve(ratio, kf, mode='reflect')
    return u
blurred = ndimage.convolve(pos, k, mode='reflect')
out['blurred'] = blurred.tolist()
out['rl'] = rl_ref(blurred, k, 15).tolist()
out['pos'] = pos.tolist()

json.dump(out, open(os.path.join(os.path.dirname(__file__), 'signal-ref.json'), 'w'))
