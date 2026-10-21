// The checks of the Image analysis node's algorithms against scikit-image / scipy (scripts/fixtures/image-ref.py →
// image-ref.json), and properties where there is no reference (skeleton, watershed, the ImageJ thresholds).
import { readFileSync } from 'node:fs';
import { gaussian, packPixels, unpackPixels, type Raster } from '../src/image/raster.ts';
import { bilateral, entropyFilter, gabor, gradient, hessianEigen, laplace, laplacianOfGaussian, lbp, meanFilter, medianFilter, minMaxFilter, nonLocalMeans, rollingBall, varianceFilter } from '../src/image/filters.ts';
import { closing, distanceMap, fillHoles, label, opening, separate, skeleton } from '../src/image/morph.ts';
import { canny } from '../src/image/canny.ts';
import { clahe, equalize, monotoneCurve, pickChannel } from '../src/image/tone.ts';
import { GLOBAL_METHODS, globalThreshold, localThreshold } from '../src/image/threshold.ts';
import { applySteps, newStep } from '../src/image/steps.ts';
import { encodePNG } from '../src/image/render.ts';
import { niceBar, scaleBarPlace, BAR_DEFAULTS } from '../src/image/node.ts';
import { unzlibSync } from 'fflate';
import { evaluateGraph } from '../src/engine/evaluate.ts';
import type { AppNode } from '../src/types.ts';

type Ok = (cond: boolean, what: string) => void;

export function checkImage(ok: Ok) {
  const R = JSON.parse(readFileSync(new URL('./fixtures/image-ref.json', import.meta.url), 'utf8'));
  const flat = (a: number[][]) => Float32Array.from(a.flat());
  const G = flat(R.G);
  const [h, w] = [R.G.length, R.G[0].length];
  // the largest difference, relative to the reference's range
  const rel = (a: ArrayLike<number>, ref: number[][] | number[]) => {
    const b = (ref as number[][]).flat?.() ?? (ref as number[]);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of b) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
    let m = 0;
    for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m / (hi - lo || 1);
  };
  const same = (a: ArrayLike<number>, ref: number[][]) => {
    const b = ref.flat();
    let n = 0;
    for (let i = 0; i < b.length; i++) if ((a[i] ? 1 : 0) !== (b[i] ? 1 : 0)) n++;
    return n;
  };
  const corr = (a: ArrayLike<number>, ref: number[][]) => {
    const b = ref.flat();
    const n = b.length;
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < n; i++) [ma, mb] = [ma + a[i] / n, mb + b[i] / n];
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < n; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    return sab / Math.sqrt(saa * sbb);
  };
  const E = 1e-5;

  // the pixels kept in a project: 8, 16 bit and float, gray and RGB, back as they were
  const p16 = packPixels(3, 2, 1, 16, [0, 1, 65535, 300, 40000, 7]);
  const p8 = packPixels(2, 1, 3, 8, [255, 0, 10, 1, 2, 3]);
  const pf = packPixels(2, 1, 1, 32, [-1.5, 3.25]);
  const r16 = unpackPixels(p16);
  ok(Array.from(r16.ch[0]).join() === '0,1,65535,300,40000,7' && r16.hi === 65535 && unpackPixels(p8).ch[2][1] === 3 && unpackPixels(p8).kind === 'rgb' && Array.from(unpackPixels(pf).ch[0]).join() === '-1.5,3.25' && unpackPixels(pf).lo === -1.5, 'image pixels: 16-bit, 8-bit RGB and float kept and read back exactly (deflated, base64)');

  // filters against scipy / scikit-image (the edge mirrored)
  ok(rel(gaussian(G, w, h, 1.5), R.gauss15) < E, `Gaussian σ 1.5 as scipy.ndimage.gaussian_filter (${rel(gaussian(G, w, h, 1.5), R.gauss15)})`);
  ok(rel(laplacianOfGaussian(G, w, h, 2), R.log2) < E, `LoG σ 2 as scipy gaussian_laplace (${rel(laplacianOfGaussian(G, w, h, 2), R.log2)})`);
  ok(rel(hessianEigen(G, w, h, 2, 'larger'), R.hessLarger) < E && rel(hessianEigen(G, w, h, 2, 'smaller'), R.hessSmaller) < E, 'Hessian eigenvalues σ 2 (scale-normalised) as from scipy Gaussian derivatives');
  ok(rel(gradient(G, w, h, 'sobel'), R.sobel) < E && rel(gradient(G, w, h, 'prewitt'), R.prewitt) < E && rel(gradient(G, w, h, 'scharr'), R.scharr) < E, 'gradient magnitude: Sobel, Prewitt (scipy), Scharr');
  ok(rel(laplace(G, w, h), R.laplace) < E, 'Laplacian as scipy.ndimage.laplace');
  ok(rel(meanFilter(G, w, h, 2), R.mean2) < E && rel(medianFilter(G, w, h, 2), R.median2) < E && rel(medianFilter(G, w, h, 1, 'square'), R.median1sq) < E, 'mean and median over a disk of radius 2, median over a 3 × 3 square (scipy, disk as scikit-image)');
  ok(rel(minMaxFilter(G, w, h, 2, false), R.min2) < E && rel(minMaxFilter(G, w, h, 2, true), R.max2) < E && rel(opening(G, w, h, 3), R.open3) < E && rel(closing(G, w, h, 3), R.close3) < E, 'erosion, dilation (disk 2), opening, closing (disk 3) as scipy grey morphology');
  ok(rel(varianceFilter(G, w, h, 2), R.var2) < 1e-4, `local variance over a disk (${rel(varianceFilter(G, w, h, 2), R.var2)})`);
  // entropy: scikit-image counts only the pixels inside the image — compared away from the edge
  {
    const U8 = flat(R.U8);
    const e = entropyFilter(U8, w, h, 2, 0, 256, 256);
    let m = 0;
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) m = Math.max(m, Math.abs(e[y * w + x] - R.entropy2[y][x]));
    ok(m < 1e-5, `local entropy (bits, disk 2) as scikit-image's rank.entropy away from the edge (${m})`);
  }
  ok(rel(gabor(G, w, h, 0.15, Math.PI / 6), R.gabor) < 1e-4, `Gabor magnitude as scikit-image's gabor (${rel(gabor(G, w, h, 0.15, Math.PI / 6), R.gabor)})`);
  ok(rel(lbp(G, w, h, 8, 1, 'uniform'), R.lbpU) === 0 && rel(lbp(G, w, h, 8, 1, 'default'), R.lbpD) === 0, `local binary patterns (P 8, R 1), uniform and default, as scikit-image (${same(lbp(G, w, h, 8, 1, 'uniform'), R.lbpU)} / ${same(lbp(G, w, h, 8, 1, 'default'), R.lbpD)} differ)`);
  {
    const G01 = Float32Array.from(G, (v) => v / 255);
    const e = canny(G01, w, h, 1.5, 0.05, 0.12);
    ok(same(e, R.canny) === 0, `Canny (σ 1.5, 0.05 / 0.12) as scikit-image: ${same(e, R.canny)} pixels differ of ${e.reduce((a, b) => a + b, 0)} edges`);
    const bl = bilateral(G01, w, h, 1.5, 0.1).map((v) => v * 255);
    // scikit-image's own bilateral has its spatial weights one pixel off (and its colour weights in bins): compared
    // with the filter written out, and only loosely with scikit-image's
    ok(rel(bl, R.bilateralExact) < 1e-5 && corr(bl, R.bilateral) > 0.95, `bilateral (σ 1.5 px, 0.1) as the formula written out (${rel(bl, R.bilateralExact).toExponential(1)}); near scikit-image's (correlation ${corr(bl, R.bilateral).toFixed(3)})`);
  }
  {
    const nl = nonLocalMeans(G, w, h, 8, 2, 3);
    ok(corr(nl, R.nlm) > 0.98, `non-local means close to scikit-image's (fast mode): correlation ${corr(nl, R.nlm).toFixed(4)}`);
  }
  {
    const r: Raster = { w, h, ch: [G], kind: 'gray', lo: 0, hi: 1 };
    ok(rel(equalize(r)[0], R.equalize) < 1e-5, `equalisation as scikit-image's equalize_hist (${rel(equalize(r)[0], R.equalize)})`);
    const r01: Raster = { w, h, ch: [Float32Array.from(G, (v) => v / 255)], kind: 'gray', lo: 0, hi: 1 };
    const cl = clahe(r01, 8, 2)[0];
    ok(corr(cl, R.clahe) > 0.85, `CLAHE close to scikit-image's equalize_adapthist (another clip rule): correlation ${corr(cl, R.clahe).toFixed(3)}`);
  }
  ok(rel(rollingBall(G, w, h, 5), R.rolling5) < E, `rolling ball r 5: the opening by the ball (as ImageJ) (${rel(rollingBall(G, w, h, 5), R.rolling5)})`);

  // thresholds as scikit-image (float and 8-bit), the masks of local thresholds
  for (const [name, key] of [
    ['B', 'float'],
    ['BU', '8-bit'],
  ]) {
    const img = flat(R[name]);
    const ref = R.thresholds[name];
    const bad = Object.keys(ref).filter((m) => {
      const t = globalThreshold(img, m as never);
      return typeof t === 'string' || Math.abs(t - ref[m]) > 1e-3 * Math.max(1, Math.abs(ref[m]));
    });
    ok(!bad.length, `thresholds Otsu, Yen, IsoData, Li, Mean, Minimum, Triangle of a ${key} image as scikit-image${bad.length ? `: ${bad.map((m) => `${m} ${globalThreshold(img, m as never)} ≠ ${ref[m]}`).join(', ')}` : ''}`);
  }
  {
    const P = { lo: 0, hi: 255 };
    const lm = localThreshold(G, w, h, 'mean', 7, { ...P, offset: 2 });
    const ld = localThreshold(G, w, h, 'median', 7, { ...P, offset: 2 });
    const lg = localThreshold(G, w, h, 'gaussian', 7, { ...P, offset: 2 });
    const nb = localThreshold(G, w, h, 'niblack', 7, { ...P, k: 0.2 });
    const sv = localThreshold(G, w, h, 'sauvola', 7, { ...P, k: 0.2, r: 128 });
    ok(same(lm, R.localMean) + same(ld, R.localMedian) + same(lg, R.localGauss) + same(nb, R.niblack) + same(sv, R.sauvola) === 0, `local thresholds mean, median, Gaussian, Niblack, Sauvola (window 7) as scikit-image (${[same(lm, R.localMean), same(ld, R.localMedian), same(lg, R.localGauss), same(nb, R.niblack), same(sv, R.sauvola)].join(' ')} pixels differ)`);
  }
  // every ImageJ method on a clear bimodal image: a threshold between the two populations, the blobs found
  {
    const img = flat(R.B);
    const wB = R.B[0].length;
    const hB = R.B.length;
    const truth = Float32Array.from({ length: wB * hB }, (_, i) => {
      const x = i % wB;
      const y = (i - x) / wB;
      return (x - 9) ** 2 + (y - 9) ** 2 < 30 || (x - 22) ** 2 + (y - 20) ** 2 < 45 || (x - 24) ** 2 + (y - 6) ** 2 < 12 ? 1 : 0;
    });
    const off = GLOBAL_METHODS.filter(([m]) => m !== 'percentile').flatMap(([m, nm]) => {
      const t = globalThreshold(img, m);
      if (typeof t === 'string') return [`${nm}: ${t}`];
      let wrong = 0;
      img.forEach((v, i) => (wrong += (v > t ? 1 : 0) !== truth[i] ? 1 : 0));
      // between the two populations (means 60 and 170), at most 4 % of the pixels on the wrong side
      return t > 60 && t < 170 && wrong <= 0.04 * img.length ? [] : [`${nm} ${t.toFixed(1)} (${wrong} wrong)`];
    });
    const pt = globalThreshold(img, 'percentile') as number;
    const above = img.filter((v) => v > pt).length / img.length;
    ok(!off.length && Math.abs(above - 0.5) < 0.02, `all 16 methods on a bimodal image: thresholds between the populations, the blobs found; Percentile halves the pixels (${off.join(', ') || `${(above * 100).toFixed(1)} % above`})`);
  }

  // colour as scikit-image (HSV; L*a*b* D65)
  {
    const rgb = R.RGB as number[][][];
    const [hh, ww] = [rgb.length, rgb[0].length];
    const r: Raster = { w: ww, h: hh, ch: [0, 1, 2].map((k) => Float32Array.from(rgb.flat(), (p) => p[k])), kind: 'rgb', lo: 0, hi: 255 };
    const comp = (pick: 'h' | 's' | 'v' | 'L' | 'a' | 'bb', k: number, ref: number[][][]) => {
      const c = pickChannel(r, pick).ch[0];
      let m = 0;
      ref.flat().forEach((p, i) => (m = Math.max(m, Math.abs(c[i] - p[k]))));
      return m;
    };
    const dh = Math.max(comp('h', 0, R.hsv), comp('s', 1, R.hsv), comp('v', 2, R.hsv));
    const dl = Math.max(comp('L', 0, R.lab), comp('a', 1, R.lab), comp('bb', 2, R.lab));
    ok(dh < 1e-5 && dl < 1e-3, `HSV and L*a*b* channels as scikit-image's rgb2hsv / rgb2lab (${dh.toExponential(1)}, ${dl.toExponential(1)})`);
  }

  // masks: holes filled, the distance map as scipy; the skeleton thin, inside, its pieces kept; touching discs cut
  {
    const M = flat(R.M);
    const [hm, wm] = [R.M.length, R.M[0].length];
    ok(same(fillHoles(M, wm, hm), R.filled) === 0, 'fill holes as scipy binary_fill_holes');
    ok(rel(distanceMap(M, wm, hm), R.edt) < 1e-6, 'distance map as scipy distance_transform_edt (exact Euclidean)');
    const sk = skeleton(M, wm, hm);
    let inside = true;
    let thick = 0;
    sk.forEach((v, i) => {
      if (v && !M[i]) inside = false;
    });
    for (let y = 0; y < hm - 1; y++) for (let x = 0; x < wm - 1; x++) if (sk[y * wm + x] && sk[y * wm + x + 1] && sk[(y + 1) * wm + x] && sk[(y + 1) * wm + x + 1]) thick++;
    const pieces = label(sk, wm, hm).count;
    ok(inside && thick === 0 && pieces === R.edtLabels, `skeleton (Zhang–Suen): inside the shapes, no 2 × 2 block, every shape one piece (${pieces} of ${R.edtLabels})`);
    // watershed on each shape alone: the two touching discs become two, a bar and one disc stay whole, the line is
    // one pixel wide (the objects apart under 8-connectivity)
    const { labels } = label(M, wm, hm);
    const only = (l: number) => Float32Array.from(labels, (v) => (v === l ? 1 : 0));
    const disc = Float32Array.from(M, (_, i) => ((i % wm) - 8) ** 2 + (Math.floor(i / wm) - 9) ** 2 <= 25 ? 1 : 0);
    const cut = separate(only(1), wm, hm);
    let lost = 0;
    only(1).forEach((v, i) => (lost += v && !cut[i] ? 1 : 0));
    const n = [label(cut, wm, hm).count, label(separate(only(3), wm, hm), wm, hm).count, label(separate(disc, wm, hm), wm, hm).count];
    ok(n.join() === '2,1,1' && lost <= 11, `watershed: two touching discs cut in two by a line of ${lost} pixels; a bar, one disc left whole (${n.join(', ')})`);
  }

  // the steps applied in order: a threshold note, a step that cannot run said, switched off passed over
  {
    const base: Raster = { w, h, ch: [G], kind: 'gray', lo: 0, hi: 255 };
    const steps = [newStep('gaussian', 's1'), { ...newStep('invert', 's2'), on: false }, { ...newStep('threshold', 's3'), p: { ...newStep('threshold', 's3').p, method: 'otsu' } }, newStep('fillholes', 's4'), newStep('channel', 's5')];
    const r = applySteps(base, steps);
    ok(r.r.kind === 'mask' && /^Otsu: /.test(r.notes.s3 ?? '') && r.errors.s5 === 'needs a colour image' && !r.errors.s4, `steps in order: blur, (off), Otsu threshold → a mask, fill holes; a colour step on gray said (${r.notes.s3})`);
    const f = monotoneCurve([
      [0, 0],
      [0.5, 0.8],
      [1, 1],
    ]);
    let mono = true;
    for (let t = 0; t < 1; t += 0.01) if (f(t + 0.01) < f(t) - 1e-12) mono = false;
    ok(mono && Math.abs(f(0.5) - 0.8) < 1e-12 && f(0) === 0 && f(1) === 1, 'curves: monotone through its points, no overshoot');
  }

  // a PNG written here read back: its signature, size, and the rows (unfiltered) of its pixels
  {
    const px = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255]);
    const png = encodePNG(px, 2, 2, 300);
    const dv = new DataView(png.buffer);
    const sig = Array.from(png.slice(0, 8)).join() === '137,80,78,71,13,10,26,10';
    // the IDAT chunk: after IHDR (8 + 25) and pHYs (21)
    const idatLen = dv.getUint32(8 + 25 + 21);
    const raw = unzlibSync(png.slice(8 + 25 + 21 + 8, 8 + 25 + 21 + 8 + idatLen));
    ok(sig && dv.getUint32(16) === 2 && dv.getUint32(20) === 2 && Array.from(raw).join() === '0,255,0,0,0,255,0,0,0,0,255,10,20,30', 'PNG: signature, size, its rows read back (RGB, unfiltered)');
  }
  // the scale bar: a round length (1, 2, 5 × 10ⁿ) about a fifth of the width, placed in mm on the page
  {
    const b = scaleBarPlace(1000, 500, 80, { size: 0.05, unit: 'um' }, BAR_DEFAULTS);
    ok(niceBar(50) === 10 && niceBar(3.3) === 0.5 && niceBar(170) === 20 && !!b && b.len === 10 && Math.abs(b.x2 - b.x1 - 16) < 1e-9 && b.text === '10 µm' && scaleBarPlace(10, 10, 80, undefined, BAR_DEFAULTS) === null, `scale bar: round lengths; 10 µm of a 50 µm wide image on 80 mm is 16 mm, “10 µm” (${b?.text})`);
  }
  // the node: the image through its steps; a matrix with X, Y in the calibrated unit; a figure (the image, a scale bar)
  {
    const pixels = packPixels(w, h, 1, 8, Array.from(G, (v) => Math.round(v)));
    const thr = { ...newStep('threshold', 't1'), p: { ...newStep('threshold', 't1').p, method: 'otsu' } };
    const node = { id: 'im', type: 'image', position: { x: 0, y: 0 }, data: { name: 'cells.tif', pixels, pixelsId: 'p1', steps: [thr], cal: { size: 0.5, unit: 'µm' } } } as AppNode;
    const res = evaluateGraph([node], []).get('im')!;
    const M = res.outputs.matrix;
    const F = res.outputs.figure;
    const anns = F?.t === 'figure' ? F.v.axes[0].annotations : [];
    const img = anns.find((a) => a.kind === 'shape' && a.shape.kind === 'image');
    const txt = anns.find((a) => a.kind === 'text');
    const href = img?.kind === 'shape' ? String(img.shape.href) : '';
    const label = txt?.kind === 'text' ? txt.text.text : '';
    ok(M?.t === 'matrix' && M.v.rows === h && M.v.cols === w && M.v.xs?.[2] === 1 && M.v.xName === 'X (µm)' && [...M.v.v].every((v) => v === 0 || v === 1) && F?.t === 'figure' && Math.abs(F.v.height - (80 * h) / w) < 1e-3 && href.startsWith('data:image/png;base64,') && /µm$/.test(label) && /^Otsu: /.test(res.view.image?.notes.t1 ?? ''), `Image node: thresholded (Otsu) → a 0 / 1 matrix with X in µm; a figure of its proportions with the image and a scale bar (${label})`);
    const bad = evaluateGraph([{ ...node, data: { ...node.data, steps: [newStep('skeleton', 'k1')] } } as AppNode], []).get('im')!;
    const none = evaluateGraph([{ ...node, data: { name: '', steps: [] } } as AppNode], []).get('im')!;
    ok(bad.warnings.some((x) => x.startsWith('Step 1 (Skeleton): needs a mask')) && none.view.waiting !== undefined, 'Image node: a step that cannot run said with its number; no image yet: waiting');
  }
}
