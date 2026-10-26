# Reference values for Segment anything in Image analysis (src/image/sam.ts), from PyTorch as Segment Anything's own
# predictor does it: an image resized to the encoder's square (bilinear with antialias, its longest side 1024) and made
# the model's standard (mean, spread, padded with 0), a few of its values; a mask of the decoder (logits 256 × 256)
# enlarged to the image (bilinear to 1024, the image's part of it, bilinear to the image's size), above 0.
# Run: python scripts/fixtures/sam-ref.py  (writes sam-ref.json beside it)
import json
import os

import numpy as np
import torch
import torch.nn.functional as F

out = {}
for name, (w, h) in {'shrunk': (1500, 900), 'enlarged': (300, 200)}.items():
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    img = (127 + 100 * np.sin(xx / 7.0) * np.cos(yy / 11.0) + 20 * ((xx // 37 + yy // 23) % 2)).astype(np.float32)
    s = 1024 / max(w, h)
    nw, nh = int(w * s + 0.5), int(h * s + 0.5)
    t = torch.from_numpy(img)[None, None]
    r = F.interpolate(t, (nh, nw), mode='bilinear', align_corners=False, antialias=True)[0, 0].numpy()
    lo, hi = float(img.min()), float(img.max())
    st = np.clip((img - lo) * 255 / (hi - lo), 0, 255)
    rs = F.interpolate(torch.from_numpy(st)[None, None], (nh, nw), mode='bilinear', align_corners=False, antialias=True)[0, 0].numpy()
    rng = np.random.default_rng(5)
    at = [[int(rng.integers(0, nw)), int(rng.integers(0, nh))] for _ in range(40)]
    # (a smooth mask of the decoder: a few blobs)
    gy, gx = np.mgrid[0:256, 0:256].astype(np.float64)
    m = -3 + 6 * np.exp(-((gx - 60) ** 2 + (gy - 50) ** 2) / 300) + 5 * np.exp(-((gx - 150) ** 2 + (gy - 70) ** 2) / 900) + 0.8 * np.sin(gx / 9)
    lo_ = torch.from_numpy(m.astype(np.float32))[None, None]
    up = F.interpolate(lo_, (1024, 1024), mode='bilinear', align_corners=False)[..., :nh, :nw]
    up = F.interpolate(up, (h, w), mode='bilinear', align_corners=False)[0, 0].numpy() > 0
    out[name] = {
        'w': w,
        'h': h,
        'nw': nw,
        'nh': nh,
        'at': at,
        'resized': [float(r[y, x]) for x, y in at],
        'input': [float((rs[y, x] - 123.675) / 58.395) for x, y in at],
        'maskArea': int(up.sum()),
        'maskRows': [[int(v) for v in np.nonzero(np.diff(np.r_[0, up[y].astype(np.int8), 0]))[0]] for y in range(0, h, max(1, h // 20))],
    }
with open(os.path.join(os.path.dirname(__file__), 'sam-ref.json'), 'w') as f:
    json.dump(out, f)
print({k: (v['nw'], v['nh'], v['maskArea']) for k, v in out.items()})
