# The reference values of npm run check for the wavelets (PyWavelets): the decomposition filters of Haar, Daubechies 2
# and 4, Symlet 4; the multilevel transform (periodization) and its inverse; the denoising — the signal extended
# symmetrically to a multiple of 2^level, wavedec, the universal threshold from the MAD of the finest details, soft and
# hard, waverec, cut back.
# python -W ignore scripts/fixtures/wavelet-ref.py
import json, os
import numpy as np
import pywt

rng = np.random.default_rng(4)
n = 512
t = np.arange(n)
clean = np.sin(2 * np.pi * t / 128) + (t > 300) * 1.0
noisy = clean + 0.2 * rng.normal(size=n)
odd = noisy[:487]  # a length that is not a multiple of 2^level
x64 = np.sin(np.arange(64) * 0.3) + 0.1 * (np.arange(64) % 7)
out = {'x64': x64.tolist(), 'noisy': noisy.tolist(), 'odd': odd.tolist(), 'pywt': pywt.__version__, 'filters': {}, 'dwt': {}, 'denoise': {}}
for w in ['haar', 'db2', 'db4', 'sym4']:
    W = pywt.Wavelet(w)
    out['filters'][w] = {'dec_lo': list(W.dec_lo), 'dec_hi': list(W.dec_hi), 'rec_lo': list(W.rec_lo), 'rec_hi': list(W.rec_hi)}
    c = pywt.wavedec(x64, w, mode='periodization', level=4)
    out['dwt'][w] = {'coeffs': [q.tolist() for q in c], 'back': pywt.waverec(c, w, mode='periodization').tolist()}


def denoise(y, w, level, mode, scale=1.0):
    n0 = len(y)
    lv = max(1, min(level, int(np.floor(np.log2(max(2, n0)))) - 1))
    block = 2 ** lv
    m = int(np.ceil(n0 / block) * block)
    ext = list(y)
    i = 0
    while len(ext) < m:
        ext.append(y[n0 - 1 - (i % n0)])
        i += 1
    c = pywt.wavedec(np.array(ext), w, mode='periodization', level=lv)
    sigma = np.median(np.abs(c[-1])) / 0.6745
    thr = scale * sigma * np.sqrt(2 * np.log(m))
    c = [c[0]] + [pywt.threshold(q, thr, mode=mode) for q in c[1:]]
    return pywt.waverec(c, w, mode='periodization')[:n0], thr


for w in ['haar', 'db2', 'db4', 'sym4']:
    for mode in ['soft', 'hard']:
        for name, y, lv in [('noisy', noisy, 5), ('odd', odd, 4)]:
            r, thr = denoise(y, w, lv, mode)
            out['denoise'][f'{w}_{mode}_{name}'] = {'y': r.tolist(), 'thr': thr, 'level': lv}
with open(os.path.join(os.path.dirname(__file__), 'wavelet-ref.json'), 'w') as f:
    json.dump(out, f)
print('ok', pywt.__version__, [len(q) for q in pywt.wavedec(x64, 'db4', mode='periodization', level=4)])
