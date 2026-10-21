# The reference values of npm run check for the Image analysis node (scikit-image 0.25, scipy, numpy):
# python -W ignore scripts/fixtures/image-ref.py
# Small synthetic images whose values are exact in float32 (multiples of 1/8), so the differences are the algorithms'.
import json, os
import numpy as np
from scipy import ndimage as ndi
from skimage import exposure, feature, filters, restoration
from skimage.color import rgb2hsv, rgb2lab
from skimage.filters import rank
from skimage.morphology import disk

rng = np.random.default_rng(7)
H, W = 20, 24
yy, xx = np.mgrid[0:H, 0:W]
G = 60 + 4 * xx + 2 * yy + 80 * np.exp(-((xx - 8) ** 2 + (yy - 7) ** 2) / 10) + 50 * np.exp(-((xx - 17) ** 2 + (yy - 13) ** 2) / 6) + rng.normal(0, 6, (H, W))
G = np.round(np.clip(G, 0, 255) * 8) / 8
U8 = np.round(G).astype(np.uint8)

# bimodal: dark ground, bright blobs (32 × 32)
B = rng.normal(60, 10, (32, 32))
by, bx = np.mgrid[0:32, 0:32]
blobs = ((bx - 9) ** 2 + (by - 9) ** 2 < 30) | ((bx - 22) ** 2 + (by - 20) ** 2 < 45) | ((bx - 24) ** 2 + (by - 6) ** 2 < 12)
B[blobs] = rng.normal(170, 15, blobs.sum())
B = np.round(np.clip(B, 0, 255) * 8) / 8
BU = np.round(B).astype(np.uint8)

RGB = rng.integers(0, 256, (10, 12, 3)).astype(np.uint8)
RGB[0, 0] = [255, 255, 255]
RGB[0, 1] = [0, 0, 0]
RGB[0, 2] = [200, 50, 200]  # R and B tied as the largest

# a mask: two touching discs, a ring (a hole), a bar, a speck
M = np.zeros((30, 32), bool)
my, mx = np.mgrid[0:30, 0:32]
M |= ((mx - 8) ** 2 + (my - 9) ** 2) <= 25
M |= ((mx - 16) ** 2 + (my - 9) ** 2) <= 25
M |= (((mx - 24) ** 2 + (my - 22) ** 2) <= 25) & (((mx - 24) ** 2 + (my - 22) ** 2) > 4)
M[20:24, 3:15] = True
M[27, 28] = True

f = lambda a: np.asarray(a, dtype=float).round(6).tolist()
out = {'G': f(G), 'U8': U8.tolist(), 'B': f(B), 'BU': BU.tolist(), 'RGB': RGB.tolist(), 'M': M.astype(int).tolist()}

# filters (the edge mirrored: scipy 'reflect')
out['gauss15'] = f(ndi.gaussian_filter(G, 1.5, mode='reflect'))
out['log2'] = f(ndi.gaussian_laplace(G, 2.0, mode='reflect'))
hxx = ndi.gaussian_filter(G, 2.0, order=(0, 2))
hyy = ndi.gaussian_filter(G, 2.0, order=(2, 0))
hxy = ndi.gaussian_filter(G, 2.0, order=(1, 1))
mid = (hxx + hyy) / 2
d = np.sqrt(((hxx - hyy) / 2) ** 2 + hxy**2)
out['hessLarger'] = f(4.0 * (mid + d))
out['hessSmaller'] = f(4.0 * (mid - d))
out['sobel'] = f(np.hypot(ndi.sobel(G, 1), ndi.sobel(G, 0)))
out['prewitt'] = f(np.hypot(ndi.prewitt(G, 1), ndi.prewitt(G, 0)))
sx = np.array([[-3, 0, 3], [-10, 0, 10], [-3, 0, 3]], float)
out['scharr'] = f(np.hypot(ndi.correlate(G, sx), ndi.correlate(G, sx.T)))
out['laplace'] = f(ndi.laplace(G))
D2 = disk(2).astype(float)
out['mean2'] = f(ndi.correlate(G, D2 / D2.sum(), mode='reflect'))
out['median2'] = f(ndi.median_filter(G, footprint=disk(2), mode='reflect'))
out['median1sq'] = f(ndi.median_filter(G, size=3, mode='reflect'))
out['min2'] = f(ndi.grey_erosion(G, footprint=disk(2), mode='reflect'))
out['max2'] = f(ndi.grey_dilation(G, footprint=disk(2), mode='reflect'))
out['open3'] = f(ndi.grey_opening(G, footprint=disk(3), mode='reflect'))
out['close3'] = f(ndi.grey_closing(G, footprint=disk(3), mode='reflect'))
out['var2'] = f(ndi.generic_filter(G, np.var, footprint=disk(2), mode='reflect'))
out['entropy2'] = f(rank.entropy(U8, disk(2)))  # scikit-image: the edge pixels count only what is inside
gr, gi = filters.gabor(G, frequency=0.15, theta=np.pi / 6, mode='reflect')
out['gabor'] = f(np.hypot(gr, gi))
out['lbpU'] = f(feature.local_binary_pattern(G, 8, 1, 'uniform'))
out['lbpD'] = f(feature.local_binary_pattern(G, 8, 1, 'default'))
G01 = G / 255
out['canny'] = feature.canny(G01, sigma=1.5, low_threshold=0.05, high_threshold=0.12).astype(int).tolist()
out['bilateral'] = f(restoration.denoise_bilateral(G01, sigma_color=0.1, sigma_spatial=1.5, mode='reflect') * 255)
# the bilateral filter written out (scikit-image's spatial weights are one pixel off: its grid runs −6 … 5 for 11)
def bilateral(img, ss, sr):
    h, w = img.shape
    R = max(5, 2 * int(np.ceil(3 * ss)) + 1) // 2
    p = np.pad(img, R, mode='symmetric')
    dy, dx = np.mgrid[-R:R + 1, -R:R + 1]
    ws = np.exp(-(dx**2 + dy**2) / (2 * ss * ss))
    out = np.zeros_like(img)
    for y in range(h):
        for x in range(w):
            win = p[y:y + 2 * R + 1, x:x + 2 * R + 1]
            k = ws * np.exp(-((win - img[y, x]) ** 2) / (2 * sr * sr))
            out[y, x] = (k * win).sum() / k.sum()
    return out
out['bilateralExact'] = f(bilateral(G01, 1.5, 0.1) * 255)
out['nlm'] = f(restoration.denoise_nl_means(G, h=8.0, patch_size=5, patch_distance=3, fast_mode=True, sigma=0))
out['equalize'] = f(exposure.equalize_hist(G))
out['clahe'] = f(exposure.equalize_adapthist(G01, kernel_size=8, clip_limit=0.02))

# the rolling ball as an opening by the ball (ImageJ's background; scikit-image's rolling_ball is the erosion only)
def rolling(img, r):
    R = int(np.ceil(r))
    offs = [(dx, dy, r - np.sqrt(r * r - dx * dx - dy * dy)) for dy in range(-R, R + 1) for dx in range(-R, R + 1) if dx * dx + dy * dy <= r * r]
    h, w = img.shape
    ero = np.full(img.shape, np.inf)
    for dx, dy, k in offs:
        ys = slice(max(0, -dy), min(h, h - dy)); xs = slice(max(0, -dx), min(w, w - dx))
        ys2 = slice(max(0, dy), min(h, h + dy)); xs2 = slice(max(0, dx), min(w, w + dx))
        ero[ys, xs] = np.minimum(ero[ys, xs], img[ys2, xs2] + k)
    dil = np.full(img.shape, -np.inf)
    for dx, dy, k in offs:
        ys = slice(max(0, -dy), min(h, h - dy)); xs = slice(max(0, -dx), min(w, w - dx))
        ys2 = slice(max(0, dy), min(h, h + dy)); xs2 = slice(max(0, dx), min(w, w + dx))
        dil[ys, xs] = np.maximum(dil[ys, xs], ero[ys2, xs2] - k)
    return dil
out['rolling5'] = f(rolling(G, 5.0))
# scikit-image's erosion by the ball (the first half): a check of the ball's shape
out['skRolling5'] = f(restoration.rolling_ball(G, radius=5))

# thresholds (scikit-image) of the float and the 8-bit image
th = {}
for name, img in (('B', B), ('BU', BU)):
    th[name] = {
        'otsu': float(filters.threshold_otsu(img)),
        'yen': float(filters.threshold_yen(img)),
        'isodata': float(filters.threshold_isodata(img)),
        'li': float(filters.threshold_li(img)),
        'mean': float(filters.threshold_mean(img)),
        'minimum': float(filters.threshold_minimum(img)),
        'triangle': float(filters.threshold_triangle(img)),
    }
out['thresholds'] = th
out['localMean'] = (G > filters.threshold_local(G, 7, 'mean', offset=2)).astype(int).tolist()
out['localMedian'] = (G > filters.threshold_local(G, 7, 'median', offset=2)).astype(int).tolist()
out['localGauss'] = (G > filters.threshold_local(G, 7, 'gaussian', offset=2)).astype(int).tolist()
out['niblack'] = (G > filters.threshold_niblack(G, 7, 0.2)).astype(int).tolist()
out['sauvola'] = (G > filters.threshold_sauvola(G, 7, 0.2, r=128)).astype(int).tolist()

# colour
out['hsv'] = f(rgb2hsv(RGB / 255.0))
out['lab'] = f(rgb2lab(RGB / 255.0))

# masks
out['filled'] = ndi.binary_fill_holes(M).astype(int).tolist()
out['edt'] = f(ndi.distance_transform_edt(M))
out['edtLabels'] = int(ndi.label(M, np.ones((3, 3)))[1])

path = os.path.join(os.path.dirname(__file__), 'image-ref.json')
with open(path, 'w') as fh:
    json.dump(out, fh, separators=(',', ':'))
print('wrote', path, os.path.getsize(path), 'bytes')
