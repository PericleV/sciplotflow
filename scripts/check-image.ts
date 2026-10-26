// The checks of the Image analysis node's algorithms against scikit-image / scipy (scripts/fixtures/image-ref.py →
// image-ref.json), and properties where there is no reference (skeleton, watershed, the ImageJ thresholds).
import { readFileSync } from 'node:fs';
import { cvAccuracy, fitMethod, fitSvm, learn, LEARN_METHODS, looAccuracy, scaler } from '../src/image/learn.ts';
import { accuracyOf } from '../src/image/accuracy.ts';
import { cropRaster, dataBarApart, dataBarRows, gaussian, gaussianWide, packPixels, quantile, shrinkRaster, unpackPixels, type Raster } from '../src/image/raster.ts';
import { semScale } from '../src/image/load.ts';
import { measureRois, measureSpec, valueStats, feret, lineProfile } from '../src/image/measure.ts';
import { nearRoi, offsetDistance, offsetOutline, ringMask, roiMask, traceOutline, wand, polygonArea, type Pt, type Roi } from '../src/image/roi.ts';
import { alignment, findParticles, groupLikeExamples, minAreaRect, PARTICLE_DEFAULTS, shapeFeatures, shapeName, tracedPerimeter } from '../src/image/particles.ts';
import { dropLikeRejected, FEATURE_NAMES, findLike, fitBox, matchFeatures, MATCH_DEFAULTS, MATCH_PRESETS, MATCH_TUNING, overlapOf } from '../src/image/match.ts';
import { fitRegular, REGULAR_SHAPES, snapToEdges } from '../src/image/refine.ts';
import { clickOutline, RAYS_DEFAULTS, seedsAndRays } from '../src/image/rays.ts';
import { estimateLayers } from '../src/image/layers.ts';
import { clustersImage, cubesImage, shapesImage, textureImage, type TestImage } from '../src/image/testImages.ts';
import { edgeRing, featuresOf, type TrainExample } from '../src/image/classify.ts';
import { trainBoosted, trainMlp } from '../src/image/pixelModels.ts';
import { bilateral, entropyFilter, gabor, gradient, hessianEigen, laplace, laplacianOfGaussian, lbp, meanFilter, medianFilter, minMaxFilter, nonLocalMeans, rollingBall, varianceFilter } from '../src/image/filters.ts';
import { closing, distanceMap, fillHoles, label, opening, separate, skeleton } from '../src/image/morph.ts';
import { canny } from '../src/image/canny.ts';
import { clahe, equalize, monotoneCurve, pickChannel } from '../src/image/tone.ts';
import { GLOBAL_METHODS, globalThreshold, localThreshold } from '../src/image/threshold.ts';
import { applyStep, applySteps, newStep } from '../src/image/steps.ts';
import { encodePNG } from '../src/image/render.ts';
import { niceBar, scaleBarPlace, BAR_DEFAULTS } from '../src/image/node.ts';
import { unzlibSync } from 'fflate';
import { evaluateGraph, logicalData } from '../src/engine/evaluate.ts';
import { analyzeNetwork, learnRatio, type NetworkResult } from '../src/image/network.ts';
import { arrange } from '../src/image/arrangement.ts';
import { radialSpectrum, spectrum } from '../src/image/fft2d.ts';
import { matchRings, patternCentre, profilePeriod, radialProfile, reflections, refineSpot, ringsOf, spotOf } from '../src/image/lattice.ts';
import { arealParams, autocorrelation, heightHistogram, levelSurface, profileParams, radialPSD } from '../src/image/surface.ts';
import { readGwy, readHeightText } from '../src/image/heights.ts';
import { astmG, boxCounting, intercepts, orientation } from '../src/image/texture.ts';
import { findScaleBar, labelBox, parseScale } from '../src/image/scalebar.ts';
import { outOf, particleFeatures, PARTICLE_FEATURES } from '../src/image/review.ts';
import { classIndex, decodePaint, emptyPaint, encodePaint, paintCounts, paintExamples, paintFill, paintSegment } from '../src/image/paint.ts';
import { thinOutline } from '../src/image/sam.ts';
import { dropNested, keepMasks, maskOutline, maskOver, pickMask, resizeAA, SAM_DEFAULTS, samInput, samPoints, samSize, type SamCandidate } from '../src/image/sam.ts';
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
    // a crop: the part analysed (the matrix and the figure of its size)
    const cropped = evaluateGraph([{ ...node, data: { ...node.data, crop: [3, 2, w - 10, h - 8] } } as AppNode], []).get('im')!;
    const cm = cropped.outputs.matrix;
    ok(cm?.t === 'matrix' && cm.v.cols === w - 10 && cm.v.rows === h - 8, `Image node: a crop — only that part analysed (${cm?.t === 'matrix' ? `${cm.v.cols} × ${cm.v.rows}` : '?'} of ${w} × ${h})`);
    // selections: measured on the part analysed (their places in the original's pixels), out as a workbook with the
    // mask's coverage; drawn on the figure, locked; the node evaluated again once its pixels are back from the browser's
    // storage (its key changes)
    const roi: Roi = { id: 'q', name: 'Q1', kind: 'rect', box: [9, 7, 8, 6] };
    const withRoi = { ...node, data: { ...node.data, crop: [3, 2, w - 10, h - 8], rois: [roi], measure: { keys: ['area', 'mean', 'covered'] } } } as AppNode;
    const mr = evaluateGraph([withRoi], []).get('im')!;
    const wb = mr.outputs.workbook;
    const selSheet = wb?.t === 'workbook' ? wb.v.sheets.find((x) => x.name === 'Selections') : undefined;
    const val = (n: string) => selSheet?.columns.find((c) => c.name === n)?.values[0] ?? NaN;
    let sum = 0;
    for (let y = 4; y < 10; y++) for (let x = 5; x < 13; x++) sum += Math.round(G[y * w + x]);
    const outline = mr.outputs.figure?.t === 'figure' ? mr.outputs.figure.v.axes[0].annotations.find((x) => x.kind === 'shape' && x.shape.kind === 'polygon') : undefined;
    const keyOf = (px: string) => JSON.stringify(logicalData({ ...withRoi, data: { ...withRoi.data, pixels: { ...pixels, data: px } } } as AppNode));
    ok(
      val('Area (µm²)') === 12 && Math.abs(val('Mean') - sum / 48) < 1e-9 && Number.isFinite(val('Covered (%)')) && wb?.t === 'workbook' && wb.v.sheets.some((x) => x.name === 'Summary') && !!outline?.locked && /^1 selection · coverage /.test(mr.view.image?.summary ?? '') && keyOf('') !== keyOf(pixels.data),
      `Image node: a selection measured on the part cropped (48 px = 12 µm², its mean), out as a workbook with the mask's coverage; its outline on the figure, locked; evaluated again when its pixels come back (${mr.view.image?.summary})`,
    );
  }
  // the data bar of an electron microscope under the image: found (its rows), none on an image without one
  {
    const [W, H, bar] = [120, 90, 14];
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const px = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) px[y * W + x] = y >= H - bar ? ((x > 10 && x < 40 && y % 5 === 0) || (x > 80 && x < 110 && y === H - 4) ? 255 : 0) : 60 + rnd() * 120;
    const r: Raster = { w: W, h: H, ch: [px], kind: 'gray', lo: 0, hi: 255 };
    const plain: Raster = { ...r, ch: [Float32Array.from(px, (v, i) => (i >= (H - bar) * W ? 60 + ((i * 7919) % 120) : v))] };
    const c = cropRaster(r, [0, 0, W, H - dataBarRows(r)]);
    ok(dataBarRows(r) === bar && dataBarRows(plain) === 0 && c.h === H - bar && c.ch[0][0] === px[0] && cropRaster(r, [0, 0, W, H]) === r, `Image: the data bar under an SEM image found (${dataBarRows(r)} rows of ${bar}), none on an image without one; cut off by a crop`);
    // (Find like this leaves out a bar that stands apart from the image over it; a plain ground at the foot of an image
    // — the test images' — is not one)
    const t = cubesImage();
    const ground: Raster = { w: t.w, h: t.h, ch: [Float32Array.from(t.px)], kind: 'gray', lo: 0, hi: 255 };
    ok(dataBarApart(r) === bar && dataBarRows(ground) > 0 && dataBarApart(ground) === 0, `Image: the data bar left out of Find like this when it stands apart (${dataBarApart(r)} rows); the plain ground at the foot of the cubes' image (${dataBarRows(ground)} rows alike) is not taken for one`);
  }
  // a large rolling ball as ImageJ (on the image shrunk): the background of the exact one to a few % of the range
  {
    const fast = rollingBall(G, w, h, 18);
    const exact = rollingBall(G, w, h, 18, true);
    let m = 0;
    for (let i = 0; i < G.length; i++) m = Math.max(m, Math.abs(fast[i] - exact[i]));
    let [lo, hi] = [Infinity, -Infinity];
    for (const v of G) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
    ok(m / (hi - lo) < 0.08 && fast.every((v, i) => v <= G[i] + 1e-4), `rolling ball r 18 on the image shrunk (as ImageJ): within ${((m / (hi - lo)) * 100).toFixed(1)} % of the exact background, never above the image`);
  }
  // Curves: a curve per channel after the common one; the same curve the editor draws (the default: the identity)
  {
    const rgb: Raster = { w: 2, h: 1, ch: [Float32Array.of(0, 255), Float32Array.of(64, 128), Float32Array.of(255, 0)], kind: 'rgb', lo: 0, hi: 255 };
    const st = newStep('curves', 'c1');
    const same = applySteps(rgb, [st]).r;
    const inv = applySteps(rgb, [{ ...st, p: { ...st.p, r: [[0, 1], [1, 0]] } }]).r;
    ok(same.ch.every((c, k) => c.every((v, i) => Math.abs(v - rgb.ch[k][i]) < 1e-3)) && Math.abs(inv.ch[0][0] - 255) < 1e-3 && Math.abs(inv.ch[0][1]) < 1e-3 && Math.abs(inv.ch[1][1] - 128) < 1e-3, 'Curves: the default leaves the image as it is; R inverted alone (G, B kept)');
  }
  // the pixel size an SEM writes in its TIFF: FEI / Thermo (m), Zeiss (nm), Tescan (m)
  {
    const fei = semScale({ t34682: ['[Scan]\nPixelWidth=2.5e-009\nPixelHeight=2.5e-009'] });
    const zeiss = semScale({ t34118: ['AP_IMAGE_PIXEL_SIZE\nImage Pixel Size = 12.40 nm\n'] });
    const tescan = semScale({ t50431: ['PixelSizeX=4.6e-07\n'] });
    ok(fei?.size === 2.5 && fei.unit === 'nm' && zeiss?.size === 12.4 && zeiss.unit === 'nm' && tescan?.size === 0.46 && tescan.unit === 'µm' && semScale({ t270: ['nothing here'] }) === undefined, `Image: the pixel size read from an SEM's TIFF tags (FEI ${fei?.size} ${fei?.unit}, Zeiss ${zeiss?.size} ${zeiss?.unit}, Tescan ${tescan?.size} ${tescan?.unit})`);
  }
  // the editor's preview: the image shrunk by block means (a mask by the majority), a step's lengths in pixels with it
  {
    const W = 9;
    const H = 7;
    const c = Float32Array.from({ length: W * H }, (_, i) => i);
    const sm = shrinkRaster({ w: W, h: H, ch: [c], kind: 'gray', lo: 0, hi: W * H }, 3);
    const m = shrinkRaster({ w: 4, h: 2, ch: [Float32Array.of(1, 1, 0, 0, 1, 0, 0, 0)], kind: 'mask', lo: 0, hi: 1 }, 2);
    // (block 0: rows 0–2, columns 0–2: mean of 0 1 2 9 10 11 18 19 20; the last row a block of one row)
    const blur = { ...newStep('gaussian', 'g'), p: { ...newStep('gaussian', 'g').p, sigma: 6 } };
    const big = gaussian(c, W, H, 3)[0];
    const sc = applyStep({ w: W, h: H, ch: [c], kind: 'gray', lo: 0, hi: W * H }, blur, 0.5);
    ok(sm.w === 3 && sm.h === 3 && sm.ch[0][0] === 10 && sm.ch[0][6] === 55 && m.ch[0].join() === '1,0' && typeof sc !== 'string' && Math.abs(sc.r.ch[0][0] - big) < 1e-4, `Image preview: shrunk by block means (${sm.ch[0][0]}, ${sm.ch[0][6]}), a mask by the majority; σ 6 px on a preview of half the size is σ 3`);
  }
  // a wide Gaussian (a background) on the image shrunk: the same surface as the full kernel to well under 1 % of the range
  {
    const N = 160;
    const c = Float32Array.from({ length: N * N }, (_, i) => 100 + 60 * Math.sin((i % N) / 13) * Math.cos(Math.floor(i / N) / 17) + ((i * 7919) % 31));
    const ref = gaussian(c, N, N, 20);
    const fast = gaussianWide(c, N, N, 20);
    let d = 0;
    for (let i = 0; i < c.length; i++) d = Math.max(d, Math.abs(fast[i] - ref[i]));
    const q = Float32Array.from({ length: 1001 }, (_, i) => (i * 37) % 1001);
    ok(d / 150 < 0.01 && quantile(q, 0.25) === 250 && Math.abs(quantile(q, 0.9995) - 999.5) < 1e-9, `wide Gaussian σ 20 on the image shrunk: within ${((d / 150) * 100).toFixed(2)} % of the full kernel; quantiles by selection`);
  }
  // selections: the pixels inside (their centres), shape and intensity as scikit-image's regionprops, scipy, numpy
  {
    const RR = JSON.parse(readFileSync(new URL('./fixtures/roi-ref.json', import.meta.url), 'utf8'));
    const img: Raster = { w, h, ch: [G], kind: 'gray', lo: 0, hi: 255 };
    const bad: string[] = [];
    for (const [key, ref] of Object.entries(RR) as [string, Record<string, number> & { roi: Partial<Roi> }][]) {
      const roi = { id: key, name: key, ...ref.roi } as Roi;
      const all = ['area', 'perimeter', 'centroid', 'ellipse', 'feret', 'shape', 'mean', 'sd', 'median', 'skew'] as const;
      const res = measureRois({ image: img, mask: null, ox: 0, oy: 0, rois: [roi], spec: measureSpec({ keys: [...all] }), name: 't' });
      const col = (n: string) => res.book.sheets[0].columns.find((c) => c.name === n)?.values[0] ?? NaN;
      const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
      const checks: [string, number, number][] = [
        ['n', col('Area (px²)'), ref.n],
        ['cx', col('X (px)'), ref.cx],
        ['cy', col('Y (px)'), ref.cy],
        ['major', col('Major (px)'), ref.major],
        ['minor', col('Minor (px)'), ref.minor],
        ['mean', col('Mean'), ref.mean],
        ['sd', col('SD'), ref.sd],
        ['median', col('Median'), ref.median],
        ['skew', col('Skewness'), ref.skew],
        ['kurt', col('Kurtosis'), ref.kurt],
        ['feret', col('Feret (px)'), ref.feret],
        ['perimeter', col('Perimeter (px)'), ref.perimeter],
        ['solidity', col('Solidity'), Math.min(1, ref.n / ref.hull)],
      ];
      for (const [what, a, b] of checks) if (!near(a, b)) bad.push(`${key} ${what} ${a} ≠ ${b}`);
    }
    ok(!bad.length, `selections: pixels inside, centroid, fitted ellipse, intensity (mean, SD, median, skewness, kurtosis), Feret, perimeter, solidity as regionprops / scipy${bad.length ? `: ${bad.join(', ')}` : ''}`);
  }
  // the wand: the outline of the pixels found, its area their number; ImageJ's perimeter of one pixel; a ring around a
  // spot as its distance says; Feret and its angle; a profile along a line
  {
    const W2 = 12;
    const H2 = 10;
    const c = new Float32Array(W2 * H2);
    // an L with a hole, and a pixel apart
    for (let y = 2; y < 8; y++) for (let x = 2; x < 5; x++) c[y * W2 + x] = 1;
    for (let x = 5; x < 9; x++) for (let y = 6; y < 8; y++) c[y * W2 + x] = 1;
    c[3 * W2 + 3] = 0;
    c[1 * W2 + 10] = 1;
    const out = wand(c, W2, H2, 3.5, 6.5, 0)!;
    const one = wand(c, W2, H2, 10.2, 1.7, 0)!;
    const lonely = measureRois({ image: { w: W2, h: H2, ch: [c], kind: 'gray', lo: 0, hi: 1 }, mask: null, ox: 0, oy: 0, rois: [{ id: 'p', name: 'p', kind: 'traced', pts: one }], spec: measureSpec({ keys: ['perimeter', 'area'] }), name: 't' });
    const per = lonely.book.sheets[0].columns.find((q) => q.name === 'Perimeter (px)')!.values[0];
    const filled = roiMask({ id: 'l', name: 'l', kind: 'traced', pts: out }, W2, H2);
    const n = filled.m.reduce((a, b) => a + b, 0);
    const spot: Roi = { id: 's', name: 's', kind: 'ellipse', box: [20, 20, 8, 8] };
    const ring = ringMask(spot, 40, 40, 0, 0, 2, 3);
    let wrong = 0;
    for (let y = 0; y < ring.h; y++)
      for (let x = 0; x < ring.w; x++) {
        const d = Math.hypot(ring.x0 + x + 0.5 - 20, ring.y0 + y + 0.5 - 20) - 4;
        const want = d > 2.05 && d <= 4.95;
        const sure = d < 1.95 || d > 5.05;
        if (sure && !!ring.m[y * ring.w + x] !== want) wrong++;
      }
    const fe = feret([
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
    ]);
    const pr = lineProfile(
      Float32Array.from({ length: 100 }, (_, i) => i % 10),
      10,
      10,
      [
        [0.5, 4.5],
        [9.5, 4.5],
      ],
    );
    const st = valueStats(Float64Array.of(1, 2, 2, 3, 7));
    ok(
      polygonArea(out) === 26 && n === 26 && out.length === 6 && Math.abs(per - (4 - 2 * (2 - Math.SQRT2))) < 1e-12 && wrong === 0 && Math.abs(fe.max - 5) < 1e-12 && Math.abs(fe.angle - (180 - (Math.atan2(3, 4) * 180) / Math.PI)) < 1e-9 && Math.abs(fe.min - 3) < 1e-12 && pr.v.length === 10 && pr.v.every((v, i) => Math.abs(v - i) < 1e-9) && st.mode === 2 && st.median === 2 && traceOutline((x, y) => x === 0 && y === 0, 0, 0).length === 4,
      `wand: an L with a hole outlined on its pixels' corners (${polygonArea(out)} px, ${out.length} corners, the hole inside); one pixel's perimeter 2.83 as ImageJ (${per.toFixed(3)}); a ring of background 2 px off a spot, 3 wide (${wrong} wrong); Feret, its angle and least width of a box; a profile; mode`,
    );
  }
  // spots against their background (a ring, the others' pixels left out; a region; a global value), the mask's
  // coverage of each selection and of the image, the summary by group, lines and points
  {
    const N = 40;
    const c = new Float32Array(N * N).fill(10);
    const m = new Float32Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (Math.hypot(x + 0.5 - 10, y + 0.5 - 10) < 4) c[y * N + x] = 110;
        if (Math.hypot(x + 0.5 - 30, y + 0.5 - 10) < 4) c[y * N + x] = 60;
        if (x < 20) m[y * N + x] = 1;
      }
    const rois: Roi[] = [
      { id: 'a', name: 'A1', kind: 'ellipse', box: [10, 10, 8, 8], group: 'A', bg: { mode: 'ring', gap: 1, width: 3 } },
      { id: 'b', name: 'B1', kind: 'ellipse', box: [30, 10, 8, 8], group: 'B', bg: { mode: 'region', region: 'g' } },
      { id: 'g', name: 'bg', kind: 'rect', box: [20, 32, 30, 6], role: 'background' },
      { id: 'c', name: 'C1', kind: 'rect', box: [20, 25, 40, 2], group: 'B', bg: { mode: 'global' } },
      {
        id: 'l',
        name: 'L1',
        kind: 'line',
        pts: [
          [0, 10.5],
          [40, 10.5],
        ],
      },
      {
        id: 'p',
        name: 'P1',
        kind: 'points',
        pts: [
          [10.2, 10.7],
          [1, 1],
        ],
      },
    ];
    const res = measureRois({ image: { w: N, h: N, ch: [c], kind: 'gray', lo: 0, hi: 255 }, mask: { w: N, h: N, ch: [m], kind: 'mask', lo: 0, hi: 1 }, ox: 0, oy: 0, cal: { size: 0.5, unit: 'um' }, rois, spec: measureSpec({ globalValue: 4 }), name: 't' });
    const sheet = (n: string) => res.book.sheets.find((s) => s.name === n);
    const cell = (n: string, col: string, row: number) => sheet(n)?.columns.find((q) => q.name === col)?.values[row] ?? NaN;
    const text = (n: string, col: string) => sheet(n)?.columns.find((q) => q.name === col)?.text ?? [];
    const got = [res.book.sheets.map((s) => s.name).join(), cell('Spots', 'Net', 0), cell('Spots', 'B SD', 0), cell('Spots', 'Net', 1), cell('Spots', 'Net', 2), cell('Selections', 'Covered (%)', 0), cell('Selections', 'Covered (%)', 1), cell('Selections', 'Covered (%)', 3), cell('Selections', 'Area (µm²)', 0), cell('Selections', 'Length (µm)', 4), cell('Selections', 'Count', 5), text('Summary', 'Group').join(), cell('Summary', 'Count', 1), cell('Summary', 'Covered (%)', 4), cell('Points', 'Value', 0), res.summary].join(' | ');
    ok(got === 'Selections,Spots,Distances,Profiles,Points,Summary | 100 | 0 | 50 | 6 | 100 | 0 | 50 | 13 | 20 | 2 | A,B,(no group),all,image | 2 | 50 | 110 | 6 selections · coverage 50.0 %', `spots: net signal over a ring (the other spots left out), a region, a global value; the mask's cover of each selection and of the image; the summary by group; lines and points in µm (${got})`);
  }
  // particles (as ImageJ's Analyze Particles) on the test images, whose content is known: the clusters cut apart, every
  // shape told; the nearest neighbours of a grid and Clark–Evans; the trainable classifier finds textured particles a
  // threshold cannot
  {
    const ras = (t: TestImage): Raster => ({ w: t.w, h: t.h, ch: [Float32Array.from(t.px)], kind: 'gray', lo: 0, hi: 255 });
    const otsu = (light: boolean) => ({ ...newStep('threshold', 'o'), p: { ...newStep('threshold', 'o').p, method: 'otsu', light } });
    const cl = clustersImage();
    const cm = applySteps(ras(cl), [otsu(false), newStep('fillholes', 'f')]).r.ch[0];
    const cut = findParticles(cm, cl.w, cl.h, { ...PARTICLE_DEFAULTS, separate: true }).found;
    const whole = findParticles(cm, cl.w, cl.h, { ...PARTICLE_DEFAULTS, separate: false }).found;
    const sh = shapesImage();
    const sm = applySteps(ras(sh), [otsu(true), newStep('fillholes', 'f')]).r.ch[0];
    // (cut apart too: a long or flat particle is not cut along itself)
    const found = findParticles(sm, sh.w, sh.h, { ...PARTICLE_DEFAULTS, separate: true }).outlines;
    const centre = (o: [number, number][]) => {
      const [x0, y0, x1, y1] = [Math.min(...o.map((p) => p[0])), Math.min(...o.map((p) => p[1])), Math.max(...o.map((p) => p[0])), Math.max(...o.map((p) => p[1]))];
      return [(x0 + x1) / 2, (y0 + y1) / 2];
    };
    const truthOf = (o: [number, number][]) => {
      const [cx, cy] = centre(o);
      return sh.truth.reduce((b, q) => (Math.hypot(q.cx - cx, q.cy - cy) < Math.hypot(b.cx - cx, b.cy - cy) ? q : b)).shape;
    };
    const feats = found.map((o) => shapeFeatures({ id: '', name: '', kind: 'traced' }, o, tracedPerimeter(o)));
    const wrong = found.filter((o, i) => shapeName(feats[i]) !== truthOf(o)).length;
    // (two examples of each shape given, the others grouped like them)
    const seen = new Map<string, number>();
    const items = found.map((o, i) => {
      const t = truthOf(o);
      const n = seen.get(t) ?? 0;
      seen.set(t, n + 1);
      return { id: String(i), group: n < 2 ? t : 'particles', f: feats[i], t };
    });
    const like = groupLikeExamples(items, 'particles');
    const likeWrong = items.filter((x) => like.has(x.id) && like.get(x.id) !== x.t).length;
    ok(cut === cl.truth.length && whole === 24 && found.length === sh.truth.length && wrong === 0 && likeWrong <= 1, `particles: ${cut} discs of ${cl.truth.length} found, the clusters cut apart (${whole} without); ${found.length} shapes, none cut though cutting is on, each told right as circle, ellipse, triangle, square, rectangle or irregular (${wrong} wrong); grouped like two examples of each (${likeWrong} wrong of ${like.size})`);
  }
  {
    // a 5 × 5 grid of squares 20 px apart: every nearest neighbour 20 px away (12 px between their edges); R far above 1
    const rois: Roi[] = [];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) rois.push({ id: `g${i}${j}`, name: `g${i}${j}`, kind: 'rect', box: [10 + 20 * i, 10 + 20 * j, 8, 8] });
    const res = measureRois({ image: { w: 100, h: 100, ch: [new Float32Array(10000)], kind: 'gray', lo: 0, hi: 1 }, mask: null, ox: 0, oy: 0, rois, spec: measureSpec({ keys: ['nnd', 'shape'] }), name: 't' });
    const d = res.book.sheets.find((s) => s.name === 'Distances');
    const cc = d?.columns.find((c) => c.name === 'NND (px)')?.values ?? [];
    const ee = d?.columns.find((c) => c.name === 'NND edge (px)')?.values ?? [];
    const sum = res.book.sheets.find((s) => s.name === 'Summary');
    const R = sum?.columns.find((c) => c.name === 'Clark–Evans R')?.values[0] ?? NaN;
    const shapeCol = res.book.sheets[0].columns.find((c) => c.name === 'Shape')?.text ?? [];
    const two = new Float32Array(16);
    two[5] = 1;
    two[10] = 1;
    const diag = traceOutline((x, y) => x >= 0 && y >= 0 && x < 4 && y < 4 && two[y * 4 + x] === 1, 1, 1, true);
    ok(cc.length === 25 && [...cc].every((v) => Math.abs(v - 20) < 1e-9) && [...ee].every((v) => Math.abs(v - 12) < 1e-9) && R > 1.6 && R < 2.1 && shapeCol.every((x) => x === 'square') && polygonArea(diag) === 2, `nearest neighbours of a grid: 20 px centre to centre, 12 px edge to edge; Clark–Evans R ${R.toFixed(2)} (regular); its squares named; two pixels joined by a corner traced as one (8-connected)`);
  }
  {
    const tx = textureImage();
    const r: Raster = { w: tx.w, h: tx.h, ch: [Float32Array.from(tx.px)], kind: 'gray', lo: 0, hi: 255 };
    const otsuMask = applySteps(r, [{ ...newStep('threshold', 'o'), p: { ...newStep('threshold', 'o').p, method: 'otsu' } }]).r.ch[0];
    const byOtsu = findParticles(otsuMask, tx.w, tx.h, { ...PARTICLE_DEFAULTS, minSize: 60 }).found;
    const train: TrainExample[] = [
      ...tx.truth.slice(0, 4).map((q): TrainExample => ({ cls: 'object', pts: [[q.cx - 6, q.cy], [q.cx + 6, q.cy]], line: true, width: 3 })),
      { cls: 'background', pts: [[5, 5], [60, 5], [60, 15], [5, 15]], line: false, width: 1 },
      { cls: 'background', pts: [[400, 330], [470, 330], [470, 350], [400, 350]], line: false, width: 1 },
      { cls: 'background', pts: [[80, 90], [120, 90]], line: true, width: 3 },
    ];
    const step = newStep('classify', 'c');
    const a = applySteps(r, [step], 1, undefined, 1, { train });
    const b = applySteps(r, [step], 1, undefined, 1, { train });
    const byForest = findParticles(a.r.ch[0], tx.w, tx.h, { ...PARTICLE_DEFAULTS, minSize: 60 }).found;
    const none = applySteps(r, [step], 1, undefined, 1, { train: train.slice(0, 4) });
    ok(a.r.kind === 'mask' && Math.abs(byForest - tx.truth.length) <= 1 && Math.abs(byOtsu - tx.truth.length) > 3 && a.r.ch[0].every((v, i) => v === b.r.ch[0][i]) && /^object: \d+ px, background: \d+ px → object$/.test(a.notes.c ?? '') && /two classes/.test(none.errors.c ?? ''), `trainable classifier: ${byForest} textured particles of ${tx.truth.length} from 4 lines and 3 background examples (Otsu: ${byOtsu} pieces); the same twice; one class only: said (${a.notes.c})`);
  }
  // the trainable classifier's other learners: extra trees, boosted trees and a small neural network find the textured
  // particles as the forest does, the same twice (seeded); auto says what it chose and how often each was right; a
  // problem two of them alone can learn (two classes in rings, not split by one threshold) learnt by each
  {
    const tx = textureImage();
    const r: Raster = { w: tx.w, h: tx.h, ch: [Float32Array.from(tx.px)], kind: 'gray', lo: 0, hi: 255 };
    const train: TrainExample[] = [
      ...tx.truth.slice(0, 4).map((q): TrainExample => ({ cls: 'object', pts: [[q.cx - 6, q.cy], [q.cx + 6, q.cy]], line: true, width: 3 })),
      { cls: 'background', pts: [[5, 5], [60, 5], [60, 15], [5, 15]], line: false, width: 1 },
      { cls: 'background', pts: [[400, 330], [470, 330], [470, 350], [400, 350]], line: false, width: 1 },
      { cls: 'background', pts: [[80, 90], [120, 90]], line: true, width: 3 },
    ];
    const step = (method: string) => ({ ...newStep('classify', 'c'), p: { ...newStep('classify', 'c').p, method } });
    const found: Record<string, number> = {};
    let same = true;
    const notes: Record<string, string> = {};
    for (const m of ['extra', 'boost', 'mlp', 'auto']) {
      const a = applySteps(r, [step(m)], 1, undefined, 1, { train });
      const b = applySteps(r, [step(m)], 1, undefined, 1, { train });
      same &&= a.r.ch[0].every((v, i) => v === b.r.ch[0][i]);
      found[m] = findParticles(a.r.ch[0], tx.w, tx.h, { ...PARTICLE_DEFAULTS, minSize: 60 }).found;
      notes[m] = a.notes.c ?? '';
    }
    // (rings: the class by the distance from the middle, 0 inside 3, 1 from 3 to 6, 0 beyond)
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pts = Array.from({ length: 1200 }, () => [rnd() * 18 - 9, rnd() * 18 - 9]);
    const cls = Uint8Array.from(pts, ([u, v]) => (Math.hypot(u, v) > 3 && Math.hypot(u, v) < 6 ? 1 : 0));
    const xs = [Float32Array.from(pts, (q) => q[0]), Float32Array.from(pts, (q) => q[1])];
    const right = (pr: Float32Array[]) => pts.filter((_, i) => (pr[1][i] > pr[0][i] ? 1 : 0) === cls[i]).length / pts.length;
    const [rb, rm] = [right(trainBoosted(xs, cls, 2, 60).predict(xs, pts.length)), right(trainMlp(xs, cls, 2, 7, 24, 120).predict(xs, pts.length))];
    ok(
      Object.values(found).every((n) => Math.abs(n - tx.truth.length) <= 1) && same && /\(extra trees\)$/.test(notes.extra) && /\(boosted trees\)$/.test(notes.boost) && /\(neural network\)$/.test(notes.mlp) && /\(auto: [a-z ]+ \(random forest \d+ %, extra trees \d+ %, boosted trees \d+ %, neural network \d+ %\)\)$/.test(notes.auto) && rb > 0.97 && rm > 0.95,
      `trainable classifier, the other learners: textured particles ${tx.truth.length}, found by extra trees ${found.extra}, boosted trees ${found.boost}, the neural network ${found.mlp}, auto ${found.auto} (${notes.auto.replace(/^.*\(auto: /, 'auto: ').replace(/\)$/, '')}); the same twice; rings no threshold splits learnt by boosting (${(rb * 100).toFixed(1)} %) and the network (${(rm * 100).toFixed(1)} %)`,
    );
  }
  // Structure: a lattice of bars 6 and 7 px wide, 40 px apart (25 junctions inside the image, 40 ligaments between
  // them), with three bumps on its bars: the ligaments 40 px long, their thickness the bars' width, the bumps cut as
  // spurs; the pores the squares between the bars
  {
    // (a bar W px wide on the line c: an odd width centred on the pixel c, an even one on the edge between c − 1 and c)
    const inBar = (x: number, c: number, W: number) => (W % 2 ? Math.abs(x - c) <= (W - 1) / 2 : Math.abs(x + 0.5 - c) < W / 2);
    const grid = (W: number, bumps: Pt[] = []) => {
      const [w, h] = [200, 200];
      const m = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (const c of [20, 60, 100, 140, 180]) if (inBar(x, c, W) || inBar(y, c, W)) m[y * w + x] = 1;
      for (const [cx, cy] of bumps) for (let y = cy - 2; y < cy + 3; y++) for (let x = cx - 2; x < cx + 3; x++) m[y * w + x] = 1;
      return m;
    };
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    const bumps: Pt[] = [
      [40, 25],
      [80, 105],
      [145, 120],
    ];
    const res = [6, 7].map((W) => analyzeNetwork(grid(W, bumps), 200, 200, {}));
    const lig = res.map((r) => r.branches.filter((b) => b.counted));
    const inner = res[1].pores.filter((p) => !p.edge);
    ok(
      lig.every((l) => l.length === 40 && Math.abs(med(l.map((b) => b.length)) - 40) < 0.5) && Math.abs(med(lig[0].map((b) => b.diameter)) - 6) < 0.6 && Math.abs(med(lig[1].map((b) => b.diameter)) - 7) < 0.6 && res.every((r) => r.pruned === 3 && r.nodes.filter((n) => n.degree >= 3).length === 25) && inner.length === 16 && Math.abs(med(inner.map((p) => p.inscribed)) - 33) <= 1.5 && lig[1].every((b) => b.surface < b.length && b.surface > 28),
      `structure: 40 ligaments of 40 px (median ${med(lig[1].map((b) => b.length)).toFixed(2)}), ${med(lig[0].map((b) => b.diameter))} and ${med(lig[1].map((b) => b.diameter))} px thick, 25 junctions, the 3 bumps cut, 16 pores (${med(inner.map((p) => p.inscribed))} px across)`,
    );
    // by hand: a ligament deleted (its junctions keep three branches each), a spur kept, a
    // line drawn across a pore (two junctions more, three ligaments where there was one pore), a stroke erased, a node
    // added, a node moved; the cut learnt from a spur deleted and one kept
    const m = grid(7, bumps);
    const plain = analyzeNetwork(m, 200, 200, {});
    const del = analyzeNetwork(m, 200, 200, { hand: { del: [[40, 60]] } });
    const kept = analyzeNetwork(m, 200, 200, { hand: { keep: [[40, 25]] } });
    const drawnR = analyzeNetwork(m, 200, 200, { hand: { add: [[[80, 63], [80, 97]]] } });
    const erased = analyzeNetwork(m, 200, 200, { hand: { erase: [{ pts: [[40, 100]], r: 3 }] } });
    const split = analyzeNetwork(m, 200, 200, { hand: { split: [[120, 60]] } });
    const moved = analyzeNetwork(m, 200, 200, { hand: { move: [[[100, 100], [104, 100]]] } });
    const at = (r: NetworkResult, p: Pt) => r.branches.find((b) => b.path.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < 2));
    const learnt = learnRatio(analyzeNetwork(m, 200, 200, { prune: 'off', hand: { erase: [{ pts: [[40, 100]], r: 3 }], del: [[40, 25]], keep: [[27, 100]] } }).examples);
    ok(
      del.branches.length === plain.branches.length - 1 &&
        kept.branches.some((b) => b.keep && b.type === 'end') &&
        drawnR.branches.filter((b) => b.counted).length === 43 &&
        drawnR.branches.some((b) => b.hand) &&
        erased.branches.filter((b) => b.counted).length === 39 &&
        split.branches.length === plain.branches.length + 1 &&
        split.branches.filter((b) => b.counted).length === 41 &&
        Math.abs((at(moved, [90, 100])?.length ?? 0) - 44) < 0.5 &&
        !!learnt &&
        learnt.right === 2 &&
        learnt.ratio > 0.3 &&
        learnt.ratio < 2.4,
      `structure by hand: deleted, kept, drawn, erased, a node added and one moved; the cut learnt (${JSON.stringify(learnt)})`,
    );
    // in the node: the lattice drawn as an image, a threshold, Structure on (1 px = 2 nm, a skeleton step after the
    // threshold not taken for the mask): the sheets Network, Ligaments, Junctions, Pores in its workbook
    const img = packPixels(200, 200, 1, 8, Array.from(grid(7), (v) => (v ? 200 : 30)));
    const thr = { ...newStep('threshold', 't1'), p: { ...newStep('threshold', 't1').p, method: 'otsu' } };
    const nd = { id: 'im', type: 'image', position: { x: 0, y: 0 }, data: { name: 'npg.tif', pixels: img, pixelsId: 'npg', steps: [thr, newStep('skeleton', 'k1')], cal: { size: 2, unit: 'nm' }, network: { on: true } } } as AppNode;
    const out = evaluateGraph([nd], []).get('im')!;
    const book = out.outputs.workbook?.t === 'workbook' ? out.outputs.workbook.v : undefined;
    const sheet = (n: string) => book?.sheets.find((q) => q.name === n);
    const val = (q: string) => sheet('Network')?.columns[1].values[sheet('Network')!.columns[0].text!.indexOf(q)];
    ok(!!sheet('Ligaments') && sheet('Ligaments')!.columns[4].name === 'Length (nm)' && val('Ligaments counted') === 40 && Math.abs(val('Ligament length, median')! - 80) < 1 && Math.abs(val('Ligament diameter, median')! - 14) < 1.2 && val('Junctions') === 25 && sheet('Pores')!.columns[0].values.length === 36 && !!out.view.network, `structure in the node: its sheets, in nm (median ${val('Ligament length, median')} nm long, ${val('Ligament diameter, median')} nm thick)`);
  }
  // Arrangement: a hexagonal lattice (20 px apart) is regular — R near 2.15, ψ6 1, six neighbours, g(r)'s first peak at
  // 20 —; points at random are random (R near 1, p > 0.05, L(r) − r inside the band); clusters of 10 are clustered
  {
    const sq = (c: Pt, r = 2): Pt[] => [[c[0] - r, c[1] - r], [c[0] + r, c[1] - r], [c[0] + r, c[1] + r], [c[0] - r, c[1] + r]];
    const [W, H] = [400, 300];
    const hex: Pt[] = [];
    for (let j = 0; (j * 20 * Math.sqrt(3)) / 2 < H - 10; j++) for (let i = 0; i * 20 < W - 10; i++) hex.push([10 + i * 20 + (j % 2) * 10, 10 + (j * 20 * Math.sqrt(3)) / 2]);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ran: Pt[] = Array.from({ length: 300 }, () => [rnd() * W, rnd() * H]);
    const clu: Pt[] = [];
    for (let c = 0; c < 30; c++) {
      const [cx, cy] = [rnd() * W, rnd() * H];
      for (let q = 0; q < 10; q++) clu.push([cx + (rnd() - 0.5) * 16, cy + (rnd() - 0.5) * 16]);
    }
    const go = (pts: Pt[]) => arrange(pts.map((c, i) => ({ name: `P${i}`, c, poly: sq(c) })), W, H, {});
    const [h, r, c] = [go(hex), go(ran), go(clu)];
    const inBand = r.L.L.every((v, b) => v >= r.L.lo[b] && v <= r.L.hi[b]);
    ok(h.summary.R > 1.9 && h.summary.p < 1e-6 && Math.abs(h.summary.psi6 - 1) < 0.01 && Math.abs(h.summary.coord - 6) < 0.01 && Math.abs(h.summary.peak - 20) < 1 && Math.abs(r.summary.R - 1) < 0.1 && r.summary.p > 0.05 && inBand && c.summary.R < 0.5 && c.summary.clusters < 120 && c.L.L.every((v, b) => v > r.L.hi[b] || b < 2), `arrangement: hexagonal R ${h.summary.R.toFixed(2)} ψ6 ${h.summary.psi6.toFixed(2)} peak ${h.summary.peak.toFixed(1)}; random R ${r.summary.R.toFixed(2)} (p ${r.summary.p.toFixed(2)}, L in the band ${inBand}); clustered R ${c.summary.R.toFixed(2)} in ${c.summary.clusters} clusters`);
    // in the node: the selections of the lattice (1 px = 0.5 nm) give the sheets Arrangement, Neighbours, g(r), Ripley L
    const img = packPixels(W, H, 1, 8, new Array(W * H).fill(30));
    const rois = hex.map((cc, i) => ({ id: `h${i}`, name: `P${i + 1}`, kind: 'rect', box: [cc[0], cc[1], 4, 4], angle: 0 }));
    const nd = { id: 'im', type: 'image', position: { x: 0, y: 0 }, data: { name: 'lattice.png', pixels: img, pixelsId: 'lat', steps: [], cal: { size: 0.5, unit: 'nm' }, rois, arrange: { on: true } } } as AppNode;
    const out = evaluateGraph([nd], []).get('im')!;
    const book = out.outputs.workbook?.t === 'workbook' ? out.outputs.workbook.v : undefined;
    const sh = (n: string) => book?.sheets.find((q) => q.name === n);
    const val = (q: string) => sh('Arrangement')?.columns[1].values[sh('Arrangement')!.columns[0].text!.indexOf(q)];
    ok(!!sh('Neighbours') && sh('Neighbours')!.columns[5].name === 'NND (nm)' && Math.abs(val('NND, mean')! - 10) < 0.05 && Math.abs(val('g(r) first peak')! - 10) < 0.6 && !!sh('g(r)') && !!sh('Ripley L') && !!sh('NND distribution') && !!out.view.arrange, `arrangement in the node: its sheets, in nm (NND ${val('NND, mean')} nm)`);
  }
  // Frequency: a lattice of two waves 8 px apart (60° between them) on a ramp, with noise — the spectrum's spot at N/8
  // from its middle, the radial spectrum's peak at d = 8; Band-pass takes the ramp out; the Bragg filter (the lattice's
  // spots kept) gives the lattice back with less than the noise; in the node, the sheet Radial spectrum
  {
    const [w, h] = [200, 150];
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const wave = (x: number, y: number) => 20 * Math.cos((2 * Math.PI * x) / 8) + 20 * Math.cos((2 * Math.PI * (x * 0.5 + y * 0.866)) / 8);
    const c = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) c[y * w + x] = 100 + wave(x, y) + 0.3 * x + 30 * (rnd() - 0.5);
    const sp = spectrum(c, w, h, { log: true, hann: true });
    const half = sp.N / 2;
    let [best, at] = [0, 0];
    sp.mag.forEach((v, i) => {
      const [u, q] = [(i % sp.N) - half, Math.floor(i / sp.N) - half];
      if (u * u + q * q > 16 && v > best) [best, at] = [v, i];
    });
    const dSpot = sp.N / Math.hypot((at % sp.N) - half, Math.floor(at / sp.N) - half);
    const rs = radialSpectrum(c, w, h);
    const colMean = (img: Float32Array, x: number) => Array.from({ length: h }, (_, y) => img[y * w + x]).reduce((a, b) => a + b, 0) / h;
    const r: Raster = { w, h, ch: [c], kind: 'gray', lo: 0, hi: 255 };
    const bp = applyStep(r, { ...newStep('bandpass', 'b'), p: { ...newStep('bandpass', 'b').p, large: 40, small: 3 } });
    const bpc = typeof bp === 'string' ? c : bp.r.ch[0];
    const mean = c.reduce((a, b) => a + b, 0) / c.length;
    const fm = applyStep(r, { ...newStep('fftmask', 'f'), p: { ...newStep('fftmask', 'f').p, spots: [[1 / 8, 0], [0.5 / 8, 0.866 / 8]] } });
    const fmc = typeof fm === 'string' ? c : fm.r.ch[0];
    let e = 0;
    for (let y = 10; y < h - 10; y++) for (let x = 10; x < w - 10; x++) e += (fmc[y * w + x] - mean - wave(x, y)) ** 2;
    const rms = Math.sqrt(e / ((w - 20) * (h - 20)));
    const none = applyStep(r, newStep('fftmask', 'g'));
    const nd = { id: 'im', type: 'image', position: { x: 0, y: 0 }, data: { name: 'lattice.png', pixels: packPixels(w, h, 1, 8, Array.from(c, (v) => Math.max(0, Math.min(255, Math.round(v))))), pixelsId: 'lat2', steps: [], cal: { size: 0.1, unit: 'nm' }, fft: { radial: true } } } as AppNode;
    const out = evaluateGraph([nd], []).get('im')!;
    const rsh = out.outputs.workbook?.t === 'workbook' ? out.outputs.workbook.v.sheets.find((q) => q.name === 'Radial spectrum') : undefined;
    ok(Math.abs(dSpot - 8) < 0.01 && Math.abs(rs.peakD - 8) < 0.2 && colMean(c, 190) - colMean(c, 10) > 50 && Math.abs(colMean(bpc, 190) - colMean(bpc, 10)) < 10 && rms < 6 && typeof none === 'string' && rsh?.columns[0].name === 'k (1/nm)' && Math.abs(rsh.columns[3].values[0] - 0.8) < 0.02, `frequency: the spot at d = ${dSpot.toFixed(2)} px, the radial peak at ${rs.peakD.toFixed(2)} px; band-pass: the ramp ${(colMean(bpc, 190) - colMean(bpc, 10)).toFixed(1)}; Bragg: ${rms.toFixed(2)} from the lattice (noise 8.7); the sheet (${rsh?.columns[3].values[0]} nm)`);
  }
  // Lattice: fringes of 7.3 px read along a profile; a lattice of planes 9.5 px apart turned 23°, its spot clicked 2 px
  // off and moved onto it; a gold diffraction pattern drawn (1 px = 0.07 1/nm): its centre found, its four rings, each
  // matched with gold (111, 200, 220, 311) within 0.3 %; in the node, the sheets FFT spots, Fringes and Rings
  {
    const prof = Array.from({ length: 120 }, (_, i) => 50 + 20 * Math.sin((2 * Math.PI * i) / 7.3) + 5 * Math.sin(i * 1.7));
    const per = profilePeriod(prof);
    const [w, h] = [256, 256];
    const lat = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lat[y * w + x] = 100 + 50 * Math.cos((2 * Math.PI * (x * Math.cos(0.4) + y * Math.sin(0.4))) / 9.5);
    const sp = spectrum(lat, w, h, { log: false, hann: true });
    const [fx, fy] = refineSpot(sp.mag, sp.N, (Math.cos(0.4) / 9.5) * sp.N + 2, (Math.sin(0.4) / 9.5) * sp.N - 1);
    const s1 = spotOf(fx, fy);
    const recip = 0.07;
    const [cx, cy] = [130.3, 121.7];
    const refl = reflections('Au', 6);
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pat = new Float32Array(260 * 250);
    for (let y = 0; y < 250; y++)
      for (let x = 0; x < 260; x++) {
        const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        let v = 200 * Math.exp(-r / 15);
        for (const q of refl) v += 60 * Math.exp(-((r - 1 / q.d / recip) ** 2) / 2);
        pat[y * 260 + x] = v + 5 * rnd();
      }
    const cen = patternCentre(pat, 260, 250);
    const rings = ringsOf(radialProfile(pat, 260, 250, cen[0], cen[1]));
    const m = matchRings(rings.map((R) => 1 / (R * recip)), ['Au', 'Si'], []);
    ok(
      Math.abs(per - 7.3) < 0.02 &&
        Math.abs(s1.d - 9.5) < 0.05 &&
        Math.abs(s1.angle - (180 - (0.4 * 180) / Math.PI)) < 0.5 &&
        Math.abs(refl[0].d - 0.23546) < 1e-4 &&
        Math.hypot(cen[0] - cx, cen[1] - cy) < 1.2 &&
        m.map((q) => `${q.phase} ${q.hkl}`).join() === 'Au 111,Au 200,Au 220,Au 311' &&
        m.every((q) => Math.abs(q.err) < 0.3),
      `lattice: fringes ${per.toFixed(3)} px; the spot d ${s1.d.toFixed(3)} at ${s1.angle.toFixed(1)}°; the pattern's centre ${cen.map((v) => v.toFixed(1)).join(', ')}; rings ${m.map((q) => `${q.phase} ${q.hkl} ${q.err.toFixed(2)} %`).join(', ')}`,
    );
    const img = (px: Float32Array, W: number, H: number) => packPixels(W, H, 1, 8, Array.from(px, (v) => Math.max(0, Math.min(255, Math.round(v)))));
    const latNode = { id: 'la', type: 'image', position: { x: 0, y: 0 }, data: { name: 'lattice.png', pixels: img(lat, w, h), pixelsId: 'lat3', steps: [], cal: { size: 0.02, unit: 'nm' }, rois: [{ id: 'l1', name: 'L1', kind: 'line', pts: [[20, 128], [236, 128 + 216 * Math.tan(0.4)]] }], lattice: { spots: [[fx, fy]], fringes: true } } } as AppNode;
    const patNode = { id: 'pa', type: 'image', position: { x: 0, y: 0 }, data: { name: 'saed.png', pixels: img(pat, 260, 250), pixelsId: 'saed1', steps: [], cal: { size: 1, unit: 'nm' }, lattice: { saed: true, recip, phases: ['Au'] } } } as AppNode;
    const res = evaluateGraph([latNode, patNode], []);
    const sheet = (id: string, n: string) => {
      const o = res.get(id)!.outputs.workbook;
      return o?.t === 'workbook' ? o.v.sheets.find((q) => q.name === n) : undefined;
    };
    const fr = sheet('la', 'Fringes');
    const rg = sheet('pa', 'Rings');
    ok(Math.abs(sheet('la', 'FFT spots')!.columns[3].values[0] - 0.19) < 0.002 && Math.abs(fr!.columns[2].values[0] - 0.19) < 0.003 && rg!.columns[5].text!.join() === 'Au,Au,Au,Au' && rg!.columns[6].text!.join() === '111,200,220,311', `lattice in the node: d ${sheet('la', 'FFT spots')!.columns[3].values[0].toFixed(4)} nm, fringes ${fr!.columns[2].values[0].toFixed(4)} nm, rings ${rg!.columns[6].text!.join(' ')}`);
  }
  // Surface: Level takes a tilted plane (and a bowl) off a substrate with particles on it (the highest 10 % left out);
  // a sine of amplitude A: Sa 2A/π, Sq A/√2, Sz 2A, Ssk 0, Sku 1.5, Sdq A·2π/λ/√2; a profile's roughness with its
  // waviness taken off by λc; the material ratio from 100 to 0 %; the PSD's integral Sq²; the autocorrelation of
  // smoothed noise (σ): 1/e at 2σ, Sal at 2σ√ln5, Str near 1, a surface of grooves near 0
  {
    const [w, h] = [128, 96];
    const sub = new Float32Array(w * h);
    const bowl = new Float32Array(w * h);
    const isBump = (x: number, y: number) => (x % 32) - 16 > -5 && (x % 32) - 16 < 5 && (y % 32) - 16 > -5 && (y % 32) - 16 < 5;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        sub[y * w + x] = 0.3 * x - 0.2 * y + 5 + (isBump(x, y) ? 20 : 0);
        bowl[y * w + x] = 0.002 * (x - 50) ** 2 + 0.003 * (y - 40) ** 2 + 0.01 * x * y * 0.01;
      }
    const lev = levelSurface(sub, w, h, 1, 10, 'min');
    let flatErr = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!isBump(x, y)) flatErr = Math.max(flatErr, Math.abs(lev[y * w + x]));
    const lb = levelSurface(bowl, w, h, 2, 0, 'mean');
    const bowlErr = Math.max(...Array.from(lb, Math.abs));
    const [A, lam] = [3, 32];
    const sine = Float32Array.from({ length: 256 * 64 }, (_, i) => A * Math.sin((2 * Math.PI * (i % 256)) / lam));
    const ar = arealParams(sine, 256, 64, null, 1);
    // (the mean of |sin| over the samples of a period: a little under 2/π)
    const meanAbs = (A_: number, L: number) => Array.from({ length: L }, (_, i) => Math.abs(A_ * Math.sin((2 * Math.PI * i) / L))).reduce((a, b) => a + b, 0) / L;
    const sdq = ((A * 2 * Math.PI) / lam / Math.SQRT2) * (Math.sin((2 * Math.PI) / lam) / ((2 * Math.PI) / lam));
    const prof = Float64Array.from({ length: 2000 }, (_, i) => A * Math.sin((2 * Math.PI * i) / 12) + 2 * A * Math.sin((2 * Math.PI * i) / 400) + 0.01 * i);
    const pr = profileParams(prof, 1, 80);
    const straight = profileParams(Float64Array.from({ length: 1992 }, (_, i) => A * Math.sin((2 * Math.PI * i) / 12) + 0.01 * i), 1);
    const hg = heightHistogram(sine, 50);
    // (smoothed noise: σ 4 px, 1 px = 0.5 nm)
    let seed = 7;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
    };
    const noise = gaussian(Float32Array.from({ length: 256 * 256 }, rnd), 256, 256, 4);
    // (the PSD of noise smoothed little: its power over many rings)
    const fine = gaussian(Float32Array.from({ length: 256 * 256 }, rnd), 256, 256, 1);
    const ps = radialPSD(fine, 256, 256, 0.5);
    const dk = ps.k[1] - ps.k[0];
    const integral = ps.psd.reduce((s, p, i) => s + p * 2 * Math.PI * ps.k[i] * dk, 0);
    const sq2 = arealParams(fine, 256, 256, null, NaN).Sq ** 2;
    const ac = autocorrelation(noise, 256, 256, 0.5);
    const grooves = autocorrelation(Float32Array.from({ length: 128 * 128 }, (_, i) => Math.sin((2 * Math.PI * (i % 128)) / 16) + 0.05 * rnd()), 128, 128, 1);
    ok(
      flatErr < 1e-3 &&
        bowlErr < 1e-3 &&
        Math.abs(ar.Sa - meanAbs(A, lam)) < 1e-4 &&
        Math.abs(meanAbs(A, lam) - (2 * A) / Math.PI) < 0.01 &&
        Math.abs(ar.Sq - A / Math.SQRT2) < 1e-3 &&
        Math.abs(ar.Sz - 2 * A) < 1e-3 &&
        Math.abs(ar.Ssk) < 1e-3 &&
        Math.abs(ar.Sku - 1.5) < 1e-3 &&
        Math.abs(ar.Sdq / sdq - 1) < 0.01 &&
        Math.abs(pr.Rq / (A / Math.SQRT2) - 1) < 0.03 &&
        Math.abs(straight.Ra - meanAbs(A, 12)) < 0.01 &&
        Math.abs(straight.Rz - 2 * A) < 0.01 &&
        hg.ratio[0] > 90 &&
        hg.ratio[hg.ratio.length - 1] < 10 &&
        hg.ratio.every((r, i) => !i || r <= hg.ratio[i - 1]) &&
        hg.count.reduce((a, b) => a + b, 0) === 256 * 64 &&
        Math.abs(integral / sq2 - 1) < 0.05 &&
        Math.abs(ac.lcorr / (2 * 4 * 0.5) - 1) < 0.1 &&
        Math.abs(ac.Sal / (2 * 4 * Math.sqrt(Math.log(5)) * 0.5) - 1) < 0.12 &&
        ac.Str > 0.7 &&
        grooves.Str < 0.2,
      `surface: levelled within ${flatErr.toExponential(1)} (a bowl ${bowlErr.toExponential(1)}); a sine Sa ${ar.Sa.toFixed(4)} Sq ${ar.Sq.toFixed(4)} Sku ${ar.Sku.toFixed(3)} Sdq ${(ar.Sdq / sdq).toFixed(4)} of it; a profile Rq ${(pr.Rq / (A / Math.SQRT2)).toFixed(3)} of it with λc, Ra ${straight.Ra.toFixed(3)}; PSD ∫ ${(integral / sq2).toFixed(3)} Sq²; ACF 1/e at ${ac.lcorr.toFixed(2)} (4), Sal ${ac.Sal.toFixed(2)} (5.07), Str ${ac.Str.toFixed(2)}, grooves ${grooves.Str.toFixed(2)}`,
    );
  }
  // height files: a Gwyddion file written by hand (a container, its channel 4 × 3 of 4 µm × 3 µm, heights in m);
  // Gwyddion's text export (# Width, # Value units); X Y Z lines on a grid
  {
    const bytes: number[] = [];
    const str = (s: string) => bytes.push(...new TextEncoder().encode(s), 0);
    const u32 = (n: number) => bytes.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255);
    const f64 = (v: number) => bytes.push(...new Uint8Array(Float64Array.of(v).buffer));
    const i32 = (n: number) => bytes.push(...new Uint8Array(Int32Array.of(n).buffer));
    // (an object: its name, the size of its components, them)
    const obj = (name: string, body: () => void) => {
      str(name);
      const at = bytes.length;
      u32(0);
      body();
      const size = bytes.length - at - 4;
      bytes.splice(at, 4, size & 255, (size >> 8) & 255, (size >> 16) & 255, (size >>> 24) & 255);
    };
    const unit = (name: string, u: string) => {
      str(name);
      bytes.push('o'.charCodeAt(0));
      obj('GwySIUnit', () => {
        str('unitstr');
        bytes.push('s'.charCodeAt(0));
        str(u);
      });
    };
    bytes.push(...new TextEncoder().encode('GWYP'));
    obj('GwyContainer', () => {
      str('/0/data/title');
      bytes.push('s'.charCodeAt(0));
      str('Height');
      str('/0/data');
      bytes.push('o'.charCodeAt(0));
      obj('GwyDataField', () => {
        str('xres');
        bytes.push('i'.charCodeAt(0));
        i32(4);
        str('yres');
        bytes.push('i'.charCodeAt(0));
        i32(3);
        str('xreal');
        bytes.push('d'.charCodeAt(0));
        f64(4e-6);
        str('yreal');
        bytes.push('d'.charCodeAt(0));
        f64(3e-6);
        unit('si_unit_xy', 'm');
        unit('si_unit_z', 'm');
        str('data');
        bytes.push('D'.charCodeAt(0));
        u32(12);
        for (let i = 0; i < 12; i++) f64(i * 1e-9);
      });
    });
    const g = readGwy(Uint8Array.from(bytes).buffer);
    const t = readHeightText('# Channel: Height\n# Width: 2.000 µm\n# Height: 1.000 µm\n# Value units: m\n1e-9\t2e-9\t3e-9\t4e-9\n5e-9\t6e-9\t7e-9\t8e-9\n');
    const xyz = readHeightText(['x y z', ...Array.from({ length: 12 }, (_, i) => `${(i % 4) * 0.5} ${Math.floor(i / 4) * 0.5} ${i}`)].join('\n'));
    ok(
      g.w === 4 && g.h === 3 && g.px?.unit === 'µm' && Math.abs(g.px.size - 1) < 1e-9 && g.zUnit === 'nm' && Math.abs(g.z[11] - 11) < 1e-9 && g.title === 'Height' && t.w === 4 && t.h === 2 && t.px?.unit === 'nm' && Math.abs(t.px.size - 500) < 1e-6 && t.zUnit === 'nm' && Math.abs(t.z[7] - 8) < 1e-9 && xyz.w === 4 && xyz.h === 3 && xyz.z[6] === 6,
      `height files: Gwyddion ${g.w} × ${g.h}, 1 px = ${g.px?.size} ${g.px?.unit}, z ${g.z[11]} ${g.zUnit}; text ${t.w} × ${t.h}, 1 px = ${t.px?.size} ${t.px?.unit}; X Y Z ${xyz.w} × ${xyz.h}`,
    );
  }
  // Surface in the node: a sine of 3 nm on a tilt, levelled (1 px = 10 nm): the sheet Roughness (Sa near 3 × 0.6346
  // nm, a little less as the plane fitted takes some of the sine; its Sdq); a step of 10 nm between two selections; the
  // matrix of heights named with their unit
  {
    const [w, h] = [256, 64];
    const sineZ = Float32Array.from({ length: w * h }, (_, i) => 3 * Math.sin((2 * Math.PI * (i % w)) / 32) + 0.02 * (i % w) + 0.01 * Math.floor(i / w));
    const stepZ = Float32Array.from({ length: w * h }, (_, i) => (i % w >= 128 ? 10 : 0));
    const sNode = { id: 'su', type: 'image', position: { x: 0, y: 0 }, data: { name: 'afm.gwy', pixels: packPixels(w, h, 1, 32, sineZ), pixelsId: 'afm1', steps: [newStep('level', 'lv')], cal: { size: 10, unit: 'nm' }, surface: { zUnit: 'nm', areal: true, hist: true, psd: true, acf: true } } } as AppNode;
    const tNode = { id: 'st', type: 'image', position: { x: 0, y: 0 }, data: { name: 'step.gwy', pixels: packPixels(w, h, 1, 32, stepZ), pixelsId: 'afm2', steps: [], cal: { size: 10, unit: 'nm' }, rois: [{ id: 'a', name: 'Top', kind: 'rect', box: [190, 32, 80, 40] }, { id: 'b', name: 'Base', kind: 'rect', box: [60, 32, 80, 40] }], surface: { zUnit: 'nm', step: ['a', 'b'] } } } as AppNode;
    const res = evaluateGraph([sNode, tNode], []);
    const sheet = (id: string, n: string) => {
      const o = res.get(id)!.outputs.workbook;
      return o?.t === 'workbook' ? o.v.sheets.find((q) => q.name === n) : undefined;
    };
    const rough = sheet('su', 'Roughness');
    const sa = rough?.columns.find((c) => c.name === 'Sa (nm)')?.values[0] ?? NaN;
    const sdq = rough?.columns.find((c) => c.name === 'Sdq')?.values[0] ?? NaN;
    const stp = sheet('st', 'Step height');
    const mat = res.get('su')!.outputs.matrix;
    ok(
      Math.abs(sa - 3 * 0.634573) < 0.02 && Math.abs(sdq / (((3 * 2 * Math.PI) / 32 / Math.SQRT2 / 10) * 0.9936) - 1) < 0.01 && !!sheet('su', 'Height histogram') && !!sheet('su', 'PSD') && !!sheet('su', 'ACF') && Math.abs((stp?.columns[1].values[2] ?? NaN) - 10) < 1e-6 && mat?.t === 'matrix' && mat.v.name === 'afm.gwy (nm)',
      `surface in the node: Sa ${sa.toFixed(4)} nm (1.9037), Sdq ${sdq.toFixed(5)}; the step ${stp?.columns[1].values[2]} nm; the matrix ${mat?.t === 'matrix' ? mat.v.name : '?'}`,
    );
  }
  // Structure ▸ grain size: boundaries every 20 px across and every 30 px down: horizontal lines read ℓ = 20, vertical
  // ones 30; a square grid of 20 px under three circles ℓ = 20π/4 (the mean of every direction); ASTM: ℓ 0.032 mm is
  // G 6.64. Orientation: stripes at 30° (and at −60°) found so, coherent. Fractal: a filled square D 2, its outline 1
  // (a little over: the largest boxes all touch it), a Sierpinski triangle log 3 / log 2; in the node, the sheets Grain
  // size, Orientation and Fractal
  {
    const [w, h] = [200, 180];
    const bnd = Float32Array.from({ length: w * h }, (_, i) => ((i % w) % 20 === 10 || Math.floor(i / w) % 30 === 15 ? 1 : 0));
    const g = intercepts(bnd, w, h, 'boundaries', 'grid', 5);
    const lh = g.sets[0].length / g.sets[0].hits;
    const lv = g.sets[1].length / g.sets[1].hits;
    const sq = Float32Array.from({ length: 240 * 240 }, (_, i) => ((i % 240) % 20 === 10 || Math.floor(i / 240) % 20 === 10 ? 1 : 0));
    const ci = intercepts(sq, 240, 240, 'boundaries', 'circles', 0);
    const lc = ci.sets[0].length / ci.sets[0].hits;
    const stripes = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return Float32Array.from({ length: 128 * 128 }, (_, i) => 100 + 50 * Math.sin((2 * Math.PI * ((i % 128) * Math.sin(a) + Math.floor(i / 128) * Math.cos(a))) / 9));
    };
    const o1 = orientation(stripes(30), 128, 128, 3);
    const o2 = orientation(stripes(-60), 128, 128, 3);
    const peak = o1.hist.indexOf(Math.max(...o1.hist)) - 89.5;
    const fill = Float32Array.from({ length: 256 * 256 }, (_, i) => (i % 256 >= 64 && i % 256 < 192 && Math.floor(i / 256) >= 64 && Math.floor(i / 256) < 192 ? 1 : 0));
    const dm = boxCounting(fill, 256, 256, 'mask');
    const de = boxCounting(fill, 256, 256, 'edges');
    const sier = boxCounting(Float32Array.from({ length: 256 * 256 }, (_, i) => ((i % 256) & Math.floor(i / 256) ? 0 : 1)), 256, 256, 'mask');
    const nd = { id: 'gs', type: 'image', position: { x: 0, y: 0 }, data: { name: 'grains.png', pixels: packPixels(w, h, 1, 8, Array.from(bnd, (v) => (v ? 0 : 200))), pixelsId: 'grains1', steps: [{ ...newStep('threshold', 't'), p: { ...newStep('threshold', 't').p, method: 'manual', low: 0, high: 100 } }], cal: { size: 0.5, unit: 'µm' }, texture: { grains: { on: true }, orient: { on: true }, fractal: { on: true } } } } as AppNode;
    const res = evaluateGraph([nd], []);
    const wb = res.get('gs')!.outputs.workbook;
    const sh = (n: string) => (wb?.t === 'workbook' ? wb.v.sheets.find((q) => q.name === n) : undefined);
    const gs = sh('Grain size');
    const allL = gs?.columns[3].values[2] ?? NaN;
    ok(
      Math.abs(lh - 20) < 0.01 && Math.abs(lv - 30) < 0.01 && Math.abs(lc / ((20 * Math.PI) / 4) - 1) < 0.05 && Math.abs(astmG(0.032) - 6.644) < 0.01 && Math.abs(o1.dominant - 30) < 1 && o1.coherency > 0.9 && Math.abs(peak - 30) < 1.5 && Math.abs(o2.dominant + 60) < 1 && Math.abs(dm.D - 2) < 0.05 && Math.abs(de.D - 1) < 0.15 && Math.abs(sier.D - Math.log(3) / Math.log(2)) < 0.03 && Math.abs(allL - (0.5 * 1900) / (50 + 30)) < 0.01 && !!sh('Orientation') && !!sh('Fractal'),
      `texture: ℓ ${lh.toFixed(2)} across, ${lv.toFixed(2)} down, ${lc.toFixed(2)} on circles (15.71); G(0.032 mm) ${astmG(0.032).toFixed(3)}; stripes at ${o1.dominant.toFixed(2)}° (coherency ${o1.coherency.toFixed(3)}), ${o2.dominant.toFixed(2)}°; D ${dm.D.toFixed(3)} filled, ${de.D.toFixed(3)} outline, ${sier.D.toFixed(3)} Sierpinski; the node ℓ ${allL.toFixed(3)} µm`,
    );
  }
  // the scale bar read: a white bar 120 px long, 4 thick, in a black data band under an image (its label's letters
  // under it, a frame along the whole band) found with its ends; a black bar on a light image; the labels' texts read
  // (the microscope's other lengths passed over)
  {
    const [w, h] = [400, 300];
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const img = Float32Array.from({ length: w * h }, () => 60 + 120 * rnd());
    const put = (x0: number, y0: number, bw: number, bh: number, v: number) => {
      for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) img[y * w + x] = v;
    };
    put(0, 255, w, 45, 0);
    put(0, 256, w, 1, 255);
    put(250, 275, 120, 4, 255);
    for (let k = 0; k < 5; k++) put(280 + 12 * k, 283, 7, 10, 255);
    const b1 = findScaleBar(img, w, h, 0, 255);
    const box = b1 ? labelBox(b1, w, h) : [0, 0, 0, 0];
    const light = Float32Array.from({ length: 300 * 200 }, () => 170 + 60 * rnd());
    for (let y = 180; y < 183; y++) for (let x = 20; x < 80; x++) light[y * 300 + x] = 0;
    const b2 = findScaleBar(light, 300, 200, 0, 255);
    const p = ['500 nm', '2 µm', '1.5um', '200 μm', '10 Å', 'HV 5.00 kV  WD = 5.1 mm  200 nm', '5OO nm'].map(parseScale);
    ok(
      b1?.x0 === 250 && b1.x1 === 369 && b1.y0 === 275 && b1.y1 === 278 && b1.bright && box[1] + box[3] >= 293 && b2?.x0 === 20 && b2.x1 === 79 && !b2.bright && p[0]?.value === 500 && p[0].unit === 'nm' && p[1]?.unit === 'µm' && p[2]?.value === 1.5 && p[2].unit === 'µm' && p[3]?.value === 200 && p[3].unit === 'µm' && p[4]?.unit === 'Å' && p[5]?.value === 200 && p[5].unit === 'nm' && parseScale('Mag 50 kX') === null,
      `scale bar: found at x ${b1?.x0}–${b1?.x1}, y ${b1?.y0}–${b1?.y1}; a black one at ${b2?.x0}–${b2?.x1}; labels ${p.map((q) => (q ? `${q.value} ${q.unit}` : '–')).join(', ')}`,
    );
  }
  // layers: a square drawn over two others (brighter, their corners cut by it) is on top, they under it; one alone on top
  {
    const [w, h] = [120, 80];
    const img = new Float32Array(w * h).fill(40);
    const sq = (x0: number, y0: number, s: number, v: number) => {
      for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) img[y * w + x] = v;
    };
    sq(10, 10, 24, 150);
    sq(50, 20, 24, 150);
    sq(28, 18, 26, 210);
    sq(85, 30, 20, 200);
    const outl = [150, 210, 200].flatMap((v) => findParticles(Float32Array.from(img, (x) => (x === v ? 1 : 0)), w, h, { ...PARTICLE_DEFAULTS, minSize: 5 }).outlines);
    const res = estimateLayers(outl, img, w, h);
    const cx = (o: [number, number][]) => o.reduce((s2, p) => s2 + p[0], 0) / o.length;
    const layerAt = (lo: number, hi: number) => res.layer[outl.findIndex((o) => cx(o) >= lo && cx(o) < hi)];
    ok(layerAt(0, 25) === 2 && layerAt(25, 45) === 1 && layerAt(45, 80) === 2 && layerAt(80, 120) === 1 && res.above.length === 2, `layers: the square over two others on top (layer ${layerAt(25, 45)}), they under it (${layerAt(0, 25)}, ${layerAt(45, 80)}), one alone on top`);
  }
  // seeds and rays: the nanocubes touching found one by one from the image's blobs (their size given), the clusters of
  // discs from their mask's centres — none missed, none wrong; then made squares (Refine), their side within 3 %
  {
    const run = (t: TestImage, useMask: boolean, size: number) => {
      const r: Raster = { w: t.w, h: t.h, ch: [Float32Array.from(t.px)], kind: 'gray', lo: 0, hi: 255 };
      const mask = useMask ? applySteps(r, [{ ...newStep('threshold', 'o'), p: { ...newStep('threshold', 'o').p, method: 'otsu' } }]).r : null;
      const res = seedsAndRays(r, mask, { ...RAYS_DEFAULTS, size });
      const cent = res.outlines.map((o) => [o.reduce((a2, p) => a2 + p[0], 0) / o.length, o.reduce((a2, p) => a2 + p[1], 0) / o.length]);
      const rad = (q: (typeof t.truth)[number]) => (q.side ? q.side / 2 : 10);
      const hit = t.truth.filter((q) => cent.some(([x, y]) => Math.hypot(x - q.cx, y - q.cy) < rad(q) * 0.6)).length;
      const wrong = cent.filter(([x, y]) => !t.truth.some((q) => Math.hypot(x - q.cx, y - q.cy) < rad(q) * 0.6)).length;
      return { r, res, hit, wrong };
    };
    const cu = cubesImage();
    const a1 = run(cu, false, 20);
    const a2 = run(clustersImage(), true, 0);
    const errs = a1.res.outlines
      .map((o) => {
        const f = snapToEdges(fitRegular(o, ['square'])!, a1.r.ch[0], cu.w, cu.h);
        const q = cu.truth.find((t2) => Math.hypot(t2.cx - f.cx, t2.cy - f.cy) < t2.side! * 0.4);
        return q ? Math.abs(f.w / q.side! - 1) : NaN;
      })
      .filter(Number.isFinite)
      .sort((x, y) => x - y);
    ok(a1.hit === cu.truth.length && a1.wrong === 0 && a1.res.outlines.length === cu.truth.length && a2.hit === 42 && a2.wrong === 0 && errs[errs.length >> 1] < 0.03, `seeds and rays: nanocubes ${a1.hit} of ${cu.truth.length} (from the image), discs in clusters ${a2.hit} of 42 (from the mask), none wrong; made squares, their side within ${(errs[errs.length >> 1] * 100).toFixed(1)} %`);
  }
  // the Rays tool: a click in every nanocube touching others (no size, no bright or dark given) outlines it alone, its
  // area within 10 % of the cube's; a dark disc of radius 30 and one of 4 on a bright ground, their radius within 6 %
  {
    const cu = cubesImage();
    const g = Float32Array.from(cu.px);
    const errs = cu.truth.map((q) => {
      const o = clickOutline(g, cu.w, cu.h, [q.cx, q.cy]);
      return o ? Math.abs(Math.abs(polygonArea(o)) / (q.side! * q.side!) - 1) : 1;
    });
    const good = errs.filter((e) => e < 0.1).length;
    const [w, h] = [160, 100];
    const disc = new Float32Array(w * h).fill(200);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [d1, d2] = [Math.hypot(x + 0.5 - 50, y + 0.5 - 50), Math.hypot(x + 0.5 - 120, y + 0.5 - 50)];
        if (d1 < 30 || d2 < 4) disc[y * w + x] = 60 + 10 * Math.sin(x * 1.7 + y * 2.3);
      }
    const radius = (o: Pt[] | null) => (o ? Math.sqrt(Math.abs(polygonArea(o)) / Math.PI) : 0);
    const [big, small] = [radius(clickOutline(disc, w, h, [55, 45])), radius(clickOutline(disc, w, h, [120, 50]))];
    ok(good === cu.truth.length && Math.abs(big / 30 - 1) < 0.06 && Math.abs(small / 4 - 1) < 0.06, `rays tool: ${good} of ${cu.truth.length} nanocubes outlined alone from a click (area within 10 %); dark discs of radius 30 and 4 seen ${big.toFixed(1)} and ${small.toFixed(1)}`);
  }
  // the edge steps on nanocubes touching: Otsu alone keeps clusters whole; cut along the edges inside, or the edges
  // subtracted before it, more cubes apart; the ridges bright in the gaps, dark inside the cubes
  {
    const t = cubesImage();
    const r: Raster = { w: t.w, h: t.h, ch: [Float32Array.from(t.px)], kind: 'gray', lo: 0, hi: 255 };
    const st = (k: string, p: Record<string, unknown> = {}) => ({ ...newStep(k as never, k), p: { ...newStep(k as never, k).p, ...p } });
    const count = (steps: ReturnType<typeof st>[]) => findParticles(applySteps(r, steps).r.ch[0], t.w, t.h, { ...PARTICLE_DEFAULTS, minSize: 40 }).found;
    const plain = count([st('threshold', { method: 'otsu' })]);
    const cut = count([st('threshold', { method: 'otsu' }), st('cutedges', { strength: 20 })]);
    const sub = count([st('edgesub', { k: 1 }), st('threshold', { method: 'otsu' })]);
    const fr = applySteps(r, [st('ridges')]).r.ch[0];
    const inside = t.truth.map((q) => fr[Math.round(q.cy) * t.w + Math.round(q.cx)]);
    const top = fr.reduce((a2, b2) => Math.max(a2, b2), 0);
    ok(cut >= plain + 10 && sub >= 40 && top > 0.5 && Math.max(...inside) < 0.1, `edges: Otsu ${plain} pieces of ${t.truth.length} cubes; cut along edges ${cut}; edges subtracted then Otsu ${sub}; ridges up to ${top.toFixed(2)} in the gaps, ${Math.max(...inside).toFixed(2)} at most inside`);
  }
  // Refine: every particle of the shapes image made the regular shape it is (the irregular ones, the nearest allowed);
  // the nanocubes made squares, snapped to the edges: their side within 1.5 % (median); only the shapes allowed
  {
    const ras = (t: TestImage): Raster => ({ w: t.w, h: t.h, ch: [Float32Array.from(t.px)], kind: 'gray', lo: 0, hi: 255 });
    const sh = shapesImage();
    const otsuL = { ...newStep('threshold', 'o'), p: { ...newStep('threshold', 'o').p, method: 'otsu', light: true } };
    const sm = applySteps(ras(sh), [otsuL, newStep('fillholes', 'f')]).r.ch[0];
    const outl = findParticles(sm, sh.w, sh.h, { ...PARTICLE_DEFAULTS, separate: true }).outlines;
    let [right, n] = [0, 0];
    for (const o of outl) {
      const fit = fitRegular(o, REGULAR_SHAPES)!;
      const q = sh.truth.reduce((a2, b2) => (Math.hypot(b2.cx - fit.cx, b2.cy - fit.cy) < Math.hypot(a2.cx - fit.cx, a2.cy - fit.cy) ? b2 : a2));
      if (q.shape === 'irregular' || Math.hypot(q.cx - fit.cx, q.cy - fit.cy) > 15) continue;
      n++;
      if (fit.shape === q.shape) right++;
    }
    const cu = cubesImage();
    const cr = ras(cu);
    const otsu0 = { ...newStep('threshold', 'o'), p: { ...newStep('threshold', 'o').p, method: 'otsu' } };
    const cm = applySteps(cr, [otsu0, newStep('splitlines', 's')]).r.ch[0];
    const errs: number[] = [];
    for (const o of findParticles(cm, cu.w, cu.h, { ...PARTICLE_DEFAULTS, minSize: 40 }).outlines) {
      const f = snapToEdges(fitRegular(o, ['square'])!, cr.ch[0], cu.w, cu.h);
      const q = cu.truth.find((t2) => Math.hypot(t2.cx - f.cx, t2.cy - f.cy) < t2.side! * 0.4);
      if (q) errs.push(Math.abs(f.w / q.side! - 1));
    }
    errs.sort((x, y) => x - y);
    const med = errs[errs.length >> 1];
    const only = fitRegular(outl[0], ['hexagon']);
    ok(n >= 30 && right === n && errs.length >= 45 && med < 0.015 && only?.shape === 'hexagon', `Refine: ${right} of ${n} regular particles made their shape; ${errs.length} nanocubes made squares snapped to the edges, their side within ${(med * 100).toFixed(1)} % (median); only the shapes allowed`);
  }
  // Find like this in the shape of the particle: only it and its edge (in clusters) finds every cube; with the ground
  // around it (alone), the cubes on their own are the most alike (those in clusters less: their neighbours in the ring)
  {
    const t = cubesImage();
    const c = Float32Array.from(t.px);
    const tpl = t.truth.find((q) => q.cluster === undefined)!;
    const a = (-tpl.angle! * Math.PI) / 180;
    const hs = tpl.side! / 2;
    const poly = ([[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]] as [number, number][]).map(([u, v]): [number, number] => [tpl.cx + u * Math.cos(a) - v * Math.sin(a), tpl.cy + u * Math.sin(a) + v * Math.cos(a)]);
    const hits = (f: { x: number; y: number }[]) => t.truth.filter((q) => f.some((m) => Math.hypot(m.x - q.cx, m.y - q.cy) < 0.4 * q.side!));
    const cl = findLike(c, t.w, t.h, tpl.cx, tpl.cy, 1, { ...MATCH_DEFAULTS, sizes: 0.2, context: 'cluster' }, poly);
    const al = findLike(c, t.w, t.h, tpl.cx, tpl.cy, 1, { ...MATCH_DEFAULTS, sizes: 0.2, context: 'alone', ring: 8, min: 0.2 }, poly);
    const scoreOf = (q: (typeof t.truth)[number]) => al.find((m) => Math.hypot(m.x - q.cx, m.y - q.cy) < 0.4 * q.side!)?.score ?? 0;
    const lone = t.truth.filter((q) => q.cluster === undefined).map(scoreOf);
    const inCl = t.truth.filter((q) => q.cluster !== undefined).map(scoreOf);
    ok(hits(cl).length === t.truth.length && cl.length === t.truth.length && Math.min(...lone) > 0.95 && Math.max(...inCl) < 0.9, `Find like this in the particle's shape: in clusters ${hits(cl).length} of ${t.truth.length}, none wrong; alone (ring 8 px): the cubes on their own ${Math.min(...lone).toFixed(2)} or more alike, those in clusters ${Math.max(...inCl).toFixed(2)} at most`);
    // the dashed line: a square moved out by 2 px is 4 px larger; the eraser finds the examples it passes over
    const off = offsetOutline([[0, 0], [10, 0], [10, 10], [0, 10]], 2);
    const sq: Roi = { id: 'a', name: 'a', kind: 'polygon', pts: [[0, 0], [10, 0], [10, 10], [0, 10]], train: 'object' };
    const ln: Roi = { id: 'b', name: 'b', kind: 'polyline', pts: [[20, 0], [30, 0]], width: 4, train: 'edge' };
    ok(Math.abs(polygonArea(off) - 196) < 1e-6 && nearRoi(sq, [5, 5], 1) && nearRoi(sq, [11.5, 5], 1) && !nearRoi(sq, [14, 5], 1) && nearRoi(ln, [25, 2.5], 1) && !nearRoi(ln, [25, 5], 1) && Math.abs(offsetDistance(sq.pts!, [13, 5]) - 3) < 1e-9, 'the dashed line around a model (a square 2 px out: 14 × 14); the eraser over an area, near its edge, on a stroke of its width');
    // a margin drawn by hand: drawn as the ring of 8 px, the same particles as alike as with it
    const outer = offsetOutline(poly, 8);
    const dr = findLike(c, t.w, t.h, tpl.cx, tpl.cy, 1, { ...MATCH_DEFAULTS, sizes: 0.2, context: 'drawn', min: 0.2 }, poly, outer);
    const drScore = (q: (typeof t.truth)[number]) => dr.find((m) => Math.hypot(m.x - q.cx, m.y - q.cy) < 0.4 * q.side!)?.score ?? 0;
    const dLone = t.truth.filter((q) => q.cluster === undefined).map(drScore);
    const dIn = t.truth.filter((q) => q.cluster !== undefined).map(drScore);
    ok(hits(dr).length >= 0.9 * t.truth.length && Math.min(...dLone) > 0.95 && Math.max(...dIn) < 0.9, `Find like this, a margin drawn by hand (a line 8 px out, its corners square: ${hits(dr).length} of ${t.truth.length} found, the ring ${hits(al).length}): the cubes on their own ${Math.min(...dLone).toFixed(2)} or more alike, those in clusters ${Math.max(...dIn).toFixed(2)} at most`);
    // a margin drawn only on one side of the particle: what is outside it is not compared (a neighbour there ignored)
    const half = offsetOutline(poly, 1.5);
    const dh = findLike(c, t.w, t.h, tpl.cx, tpl.cy, 1, { ...MATCH_DEFAULTS, sizes: 0.2, context: 'drawn' }, poly, half);
    ok(hits(dh).length === t.truth.length, `Find like this, a margin drawn tight (as only the particle): every cube found (${hits(dh).length} of ${t.truth.length})`);
    // the places like one left out by hand dropped: one cube of a cluster left out, those like it go, every cube on its own stays
    const R8 = 0.5 * Math.hypot(tpl.side!, tpl.side!) + 8;
    const firstCl = al.find((m) => t.truth.some((q) => q.cluster !== undefined && Math.hypot(m.x - q.cx, m.y - q.cy) < 0.4 * q.side!))!;
    const kept = dropLikeRejected(c, t.w, t.h, al, [firstCl], R8, { ...MATCH_DEFAULTS, sizes: 0.2, context: 'alone', ring: 8 }, tpl.cx, tpl.cy, poly);
    const keptLone = t.truth.filter((q) => q.cluster === undefined).every((q) => kept.some((m) => Math.hypot(m.x - q.cx, m.y - q.cy) < 0.4 * q.side!));
    const clBefore = hits(al).filter((q) => q.cluster !== undefined).length;
    const clAfter = hits(kept).filter((q) => q.cluster !== undefined).length;
    // (left out at a place a pixel off: the same cube still dropped)
    const near = (f: { x: number; y: number }[]) => f.some((m) => Math.hypot(m.x - firstCl.x, m.y - firstCl.y) < 2);
    const shifted = dropLikeRejected(c, t.w, t.h, al, [{ ...firstCl, x: firstCl.x + 1, y: firstCl.y - 1 }], R8, { ...MATCH_DEFAULTS, sizes: 0.2, context: 'alone', ring: 8 }, tpl.cx, tpl.cy, poly);
    ok(keptLone && clAfter <= clBefore / 2 && !near(kept) && !near(shifted) && dropLikeRejected(c, t.w, t.h, al, [], R8, { ...MATCH_DEFAULTS, sizes: 0.2, context: 'alone', ring: 8 }, tpl.cx, tpl.cy, poly).length === al.length, `Find like this ▸ Review: a cube in a cluster left out, the places like it dropped (in clusters ${clBefore} → ${clAfter}), every cube on its own kept`);
  }
  // Find like this, the finer settings: as before when not given; the least distance between two places; more turns and
  // sizes (Precise) find the same cubes; the brightness counted, a dimmed cube is less alike; the edges looked for only
  // inside the margin
  {
    const t = cubesImage();
    const c = Float32Array.from(t.px);
    const tpl = t.truth.find((q) => q.cluster === undefined)!;
    const R = 0.5 * Math.hypot(tpl.side!, tpl.side!);
    const hits = (f: { x: number; y: number }[]) => t.truth.filter((q) => f.some((m) => Math.hypot(m.x - q.cx, m.y - q.cy) < 0.4 * q.side!));
    const base = findLike(c, t.w, t.h, tpl.cx, tpl.cy, R, { ...MATCH_DEFAULTS, sizes: 0.2 });
    const same = findLike(c, t.w, t.h, tpl.cx, tpl.cy, R, { ...MATCH_DEFAULTS, sizes: 0.2, ...MATCH_TUNING });
    const sameAll = same.length === base.length && same.every((m, i) => m.x === base[i].x && m.y === base[i].y && m.score === base[i].score);
    const far = findLike(c, t.w, t.h, tpl.cx, tpl.cy, R, { ...MATCH_DEFAULTS, sizes: 0.2, reach: 2.5 });
    const precise = findLike(c, t.w, t.h, tpl.cx, tpl.cy, R, { ...MATCH_DEFAULTS, sizes: 0.2, ...MATCH_PRESETS.precise });
    const fast = findLike(c, t.w, t.h, tpl.cx, tpl.cy, R, { ...MATCH_DEFAULTS, sizes: 0.2, ...MATCH_PRESETS.fast });
    ok(sameAll && far.length < base.length / 2 && hits(precise).length === t.truth.length && hits(fast).length >= t.truth.length - 2, `Find like this, the finer settings: as before when given as they are; reach 2.5 (${far.length} of ${base.length}); Precise ${hits(precise).length}, Fast ${hits(fast).length} of ${t.truth.length}`);
    // (a cube on its own dimmed: its contrast against the ground a third)
    const dim = t.truth.find((q) => q.cluster === undefined && q !== tpl)!;
    const bg = [...c].sort((a, b) => a - b)[c.length >> 1];
    const d = Float32Array.from(c);
    for (let y = Math.floor(dim.cy - dim.side!); y <= dim.cy + dim.side!; y++)
      for (let x = Math.floor(dim.cx - dim.side!); x <= dim.cx + dim.side!; x++) if (Math.hypot(x - dim.cx, y - dim.cy) < 0.75 * dim.side!) d[y * t.w + x] = bg + (d[y * t.w + x] - bg) / 3;
    const scoreAt = (f: { x: number; y: number; score: number }[]) => f.find((m) => Math.hypot(m.x - dim.cx, m.y - dim.cy) < 0.4 * dim.side!)?.score ?? 0;
    const plain = findLike(d, t.w, t.h, tpl.cx, tpl.cy, R, { ...MATCH_DEFAULTS, sizes: 0.2, min: 0.1 });
    const bright = findLike(d, t.w, t.h, tpl.cx, tpl.cy, R, { ...MATCH_DEFAULTS, sizes: 0.2, min: 0.1, brightness: true });
    const others = t.truth.filter((q) => q.cluster === undefined && q !== dim).map((q) => bright.find((m) => Math.hypot(m.x - q.cx, m.y - q.cy) < 0.4 * q.side!)?.score ?? 0);
    ok(scoreAt(plain) > 0.9 && scoreAt(bright) < 0.5 && Math.min(...others) > 0.8, `Find like this, the brightness counted: a cube dimmed to a third ${scoreAt(plain).toFixed(2)} → ${scoreAt(bright).toFixed(2)}, the others on their own ${Math.min(...others).toFixed(2)} or more`);
    // the edges looked for only inside the margin: as wide as the side or more, the cube's side found as before
    const p = base.find((m) => Math.hypot(m.x - dim.cx, m.y - dim.cy) < 0.4 * dim.side!)!;
    const turn = -tpl.angle! + p.angle;
    const free = fitBox(c, t.w, t.h, p.x, p.y, turn, p.scale * tpl.side!, p.scale * tpl.side!);
    const lim = fitBox(c, t.w, t.h, p.x, p.y, turn, p.scale * tpl.side!, p.scale * tpl.side!, [0.6 * tpl.side!, 0.6 * tpl.side!]);
    ok(Math.abs(lim.w - dim.side!) / dim.side! < 0.04 && Math.abs(lim.w - free.w) < 0.5, `Find like this ▸ edges only inside the margin: the side ${lim.w.toFixed(2)} (unlimited ${free.w.toFixed(2)}, true ${dim.side})`);
  }
  // Find like this ▸ Compare: by the values, by the edges (the direction of the outline), or both. Every other cube made
  // hollow (its inside dark, its outline the same): by the edges most are found, by the values few; strong noise: by the
  // values (and both) every cube, by the edges fewer; none wrong. The first search through the FFT: the same places.
  {
    const t = cubesImage();
    const tpl = t.truth.find((q) => q.cluster === undefined)!;
    const R = 0.5 * Math.hypot(tpl.side!, tpl.side!);
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const hollow = t.truth.filter((q, j) => q !== tpl && j % 2 === 0);
    const dh = Float32Array.from(t.px);
    for (const q of hollow) {
      const th = (-q.angle! * Math.PI) / 180;
      const hs = q.side! / 2 - 3;
      for (let y = Math.floor(q.cy - q.side!); y <= q.cy + q.side!; y++)
        for (let x = Math.floor(q.cx - q.side!); x <= q.cx + q.side!; x++) {
          const [u, v] = [(x - q.cx) * Math.cos(th) + (y - q.cy) * Math.sin(th), -(x - q.cx) * Math.sin(th) + (y - q.cy) * Math.cos(th)];
          if (Math.abs(u) < hs && Math.abs(v) < hs) dh[y * t.w + x] = 60 + 10 * gauss();
        }
    }
    const dn = Float32Array.from(t.px, (v) => v + 45 * gauss());
    const near = (m: { x: number; y: number }, q: (typeof t.truth)[number]) => Math.hypot(m.x - q.cx, m.y - q.cy) < 0.4 * q.side!;
    const run = (d: Float32Array, compare: 'brightness' | 'edges' | 'both', min: number) => {
      const f = findLike(d, t.w, t.h, tpl.cx, tpl.cy, R, { ...MATCH_DEFAULTS, sizes: 0.2, compare, min });
      return { all: t.truth.filter((q) => f.some((m) => near(m, q))).length, hollow: hollow.filter((q) => f.some((m) => near(m, q))).length, wrong: f.filter((m) => !t.truth.some((q) => near(m, q))).length };
    };
    const hb = run(dh, 'brightness', 0.45);
    const he = run(dh, 'edges', 0.45);
    const nb = run(dn, 'brightness', 0.4);
    const nboth = run(dn, 'both', 0.4);
    const ne = run(dn, 'edges', 0.4);
    const pe = run(Float32Array.from(t.px), 'edges', 0.5);
    ok(he.hollow >= 15 && hb.hollow <= 6 && he.wrong + hb.wrong === 0 && nb.all === t.truth.length && nboth.all >= t.truth.length - 2 && ne.all < nb.all && nb.wrong + nboth.wrong + ne.wrong === 0 && pe.all === t.truth.length && pe.wrong === 0, `Find like this ▸ Compare: hollow cubes found by the edges ${he.hollow}, by the values ${hb.hollow} of ${hollow.length}; strong noise: by the values ${nb.all}, both ${nboth.all}, the edges ${ne.all} of ${t.truth.length}; a clean image by the edges ${pe.all}; none wrong (${he.wrong + hb.wrong + nb.wrong + nboth.wrong + ne.wrong + pe.wrong}: ${[he, hb, nb, nboth, ne, pe].map((q) => q.wrong).join(' ')})`);
    // (the first search through the FFT or directly: the same places, the same similarities)
    const a = (-tpl.angle! * Math.PI) / 180;
    const hs = tpl.side! / 2;
    const poly = ([[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]] as [number, number][]).map(([u, v]): [number, number] => [tpl.cx + u * Math.cos(a) - v * Math.sin(a), tpl.cy + u * Math.sin(a) + v * Math.cos(a)]);
    const c = Float32Array.from(t.px);
    const same = (['brightness', 'edges', 'both'] as const).flatMap((compare) =>
      [undefined, 'cluster' as const].map((context) => {
        const o = { ...MATCH_DEFAULTS, sizes: 0, step: 10, coarse: 8, compare, context };
        const d = findLike(c, t.w, t.h, tpl.cx, tpl.cy, R, { ...o, fft: false }, poly);
        const f = findLike(c, t.w, t.h, tpl.cx, tpl.cy, R, { ...o, fft: true }, poly);
        return d.length > 40 && d.length === f.length && d.every((m, i) => Math.abs(m.x - f[i].x) < 1e-9 && Math.abs(m.y - f[i].y) < 1e-9 && Math.abs(m.score - f[i].score) < 1e-6);
      }),
    );
    ok(same.every(Boolean), `Find like this, the first search through the FFT: the same places as directly (values, edges, both; a disc and only the particle): ${same.join(', ')}`);
  }
  // Find like this ▸ Review ▸ Learn from my choices: logistic regression, LDA and k-NN as scikit-learn's (on standardized
  // features: the probabilities, the leave-one-out accuracies); the forest, the same every time, right on most; auto the
  // most accurate; none with fewer than 3 examples of a kind. Accuracy: precision, recall and F1 against marked ones.
  {
    const ref = JSON.parse(readFileSync(new URL('./fixtures/learn-ref.json', import.meta.url), 'utf8')) as { X: number[][]; y: number[]; Xt: number[][]; prob: Record<string, number[]>; loo: Record<string, number> };
    const worst = (['logistic', 'lda', 'knn'] as const).map((m) => {
      const f = fitMethod(m, ref.X, ref.y);
      return Math.max(...ref.Xt.map((x, i) => Math.abs(f(x) - ref.prob[m][i])), Math.abs(looAccuracy(m, ref.X, ref.y) - ref.loo[m]));
    });
    const forest = looAccuracy('forest', ref.X, ref.y);
    const f1 = fitMethod('forest', ref.X, ref.y);
    const f2 = fitMethod('forest', ref.X, ref.y);
    const L = learn(ref.X, ref.y, 'auto');
    const best = L ? Math.max(...Object.values(L.accuracy)) : NaN;
    const few = learn(ref.X.slice(0, 4), [1, 1, 0, 1], 'auto');
    ok(
      worst.every((d) => d < 1e-6) && forest >= 0.7 && ref.Xt.every((x) => f1(x) === f2(x)) && !!L && L.accuracy[L.method] === best && Math.abs(L.importance.reduce((s, v) => s + v, 0) - 1) < 1e-9 && L.importance[0] === Math.max(...L.importance) && few === null,
      `Review ▸ learn: logistic, LDA, k-NN as scikit-learn (largest difference ${Math.max(...worst).toExponential(1)}); forest right on ${(forest * 100).toFixed(0)} %; auto ${L?.method} (${(best * 100).toFixed(0)} %), the first feature counts most; fewer than 3 of a kind: none`,
    );
    const sq = (x: number, y: number, s = 10): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
    const truth = [sq(0, 0), sq(20, 0), sq(40, 0), sq(0, 20)];
    // (two right, one twice over the same, one beside, one far out of the area marked)
    const found = [sq(1, 1), sq(21, 2), sq(22, 3), sq(30, 25), sq(500, 500)];
    const a = accuracyOf(truth, found)!;
    ok(a.tp === 2 && a.fp === 2 && a.fn === 2 && Math.abs(a.precision - 0.5) < 1e-12 && Math.abs(a.recall - 0.5) < 1e-12 && Math.abs(a.f1 - 0.5) < 1e-12 && accuracyOf([], found) === null, `Accuracy: 2 right of 4 found in the area marked, 2 of the 4 true ones missed: precision ${a.precision}, recall ${a.recall}, F1 ${a.f1}`);
  }  // the methods added: naive Bayes as scikit-learn's GaussianNB; the SVM's decision values as SVC's (the RBF kernel,
  // gamma 'scale'), its probability Platt's sigmoid as sklearn.calibration's; boosting as GradientBoostingClassifier up
  // to ties between splits (in the first rounds every example of a class has the same residual: scikit-learn breaks them
  // by its own random order of the features), so the same classes on new points and about as often right
  {
    const ref = JSON.parse(readFileSync(new URL('./fixtures/learn2-ref.json', import.meta.url), 'utf8')) as { X: number[][]; y: number[]; Xt: number[][]; svmDecision: number[]; prob: Record<string, number[]>; loo: Record<string, number> };
    const sc = scaler(ref.X);
    const svm = fitSvm(ref.X.map(sc), ref.y);
    const dDec = Math.max(...ref.Xt.map((x, i) => Math.abs(svm.decision(sc(x)) - ref.svmDecision[i])));
    const diff = (m: 'svm' | 'nb') => {
      const f = fitMethod(m, ref.X, ref.y);
      return Math.max(...ref.Xt.map((x, i) => Math.abs(f(x) - ref.prob[m][i])));
    };
    const [dSvm, dNb] = [diff('svm'), diff('nb')];
    const fb = fitMethod('boost', ref.X, ref.y);
    const sameClass = ref.Xt.filter((x, i) => fb(x) >= 0.5 === ref.prob.boost[i] >= 0.5).length;
    const loo = { svm: looAccuracy('svm', ref.X, ref.y), nb: looAccuracy('nb', ref.X, ref.y), boost: looAccuracy('boost', ref.X, ref.y) };
    ok(
      dDec < 1e-6 && dSvm < 1e-6 && dNb < 1e-12 && loo.svm === ref.loo.svm && loo.nb === ref.loo.nb && sameClass >= ref.Xt.length - 1 && Math.abs(loo.boost - ref.loo.boost) <= 0.05,
      `Review ▸ learn, the methods added as scikit-learn: naive Bayes ${dNb.toExponential(1)}; the SVM's decision values ${dDec.toExponential(1)}, its Platt probabilities ${dSvm.toExponential(1)}; the same leave-one-out accuracies (SVM ${(loo.svm * 100).toFixed(1)} %, naive Bayes ${(loo.nb * 100).toFixed(1)} %); boosting up to ties: the same class on ${sameClass} of ${ref.Xt.length} new points, right on ${(loo.boost * 100).toFixed(1)} % (scikit-learn ${(ref.loo.boost * 100).toFixed(1)} %)`,
    );
  }
  // (many examples: ten parts in turn instead of each left out, the accuracy still right and the click quick; up to 30
  // examples the same as each left out)
  {
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const X = Array.from({ length: 120 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i % 2 ? 1.2 : 0) * (j < 3 ? 1 : 0) + rnd()));
    const y = X.map((_, i) => i % 2);
    const t0 = performance.now();
    const L = learn(X, y, 'auto');
    const ms = performance.now() - t0;
    const small = X.slice(0, 30);
    const same = LEARN_METHODS.every((m) => cvAccuracy(m, small, y.slice(0, 30)) === looAccuracy(m, small, y.slice(0, 30)));
    ok(!!L && L.accuracy.logistic > 0.85 && same && ms < 2000, `Review ▸ learn with 120 examples: ten parts in turn (logistic right on ${((L?.accuracy.logistic ?? 0) * 100).toFixed(0)} %, all four methods in ${ms.toFixed(0)} ms); up to 30, each left out in turn as before`);
  }
  // the pixel classifier's features kept for the next examples (the same arrays and scale: the same features)
  {
    const t = cubesImage();
    const r: Raster = { w: t.w, h: t.h, ch: [Float32Array.from(t.px)], kind: 'gray', lo: 0, hi: 255 };
    const [a, b] = [featuresOf(r), featuresOf(r)];
    const other = featuresOf({ ...r, ch: [Float32Array.from(t.px)] });
    ok(a === b && other !== a && other.f.length === a.f.length && other.f.every((c, j) => c.every((v, i) => v === a.f[j][i])), 'Trainable classifier: the features of an image kept for the next examples, made again for another image (the same values)');
  }

  // Find like this ▸ Separate by overlap: rods side by side (their centres 10 px apart, closer than 0.75 of their
  // radius) are two particles by their outlines, one by the distance; every place found its features
  {
    const [w, h] = [260, 140];
    const c = new Float32Array(w * h).fill(40);
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < c.length; i++) c[i] += 6 * (rnd() - 0.5);
    const rod = (cx: number, cy: number, a: number) => {
      const t = (a * Math.PI) / 180;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const [u, v] = [(x + 0.5 - cx) * Math.cos(t) + (y + 0.5 - cy) * Math.sin(t), -(x + 0.5 - cx) * Math.sin(t) + (y + 0.5 - cy) * Math.cos(t)];
          if (Math.abs(u) < 4 && Math.abs(v) < 20) c[y * w + x] = 200;
        }
    };
    const truth: [number, number][] = [];
    rod(30, 70, 0);
    for (const [x, y, a] of [[90, 40, 0], [170, 45, 20], [110, 105, -15], [210, 100, 0]] as const) {
      const t = (a * Math.PI) / 180;
      const [ox, oy] = [5 * Math.cos(t), 5 * Math.sin(t)];
      rod(x - ox, y - oy, a);
      rod(x + ox, y + oy, a);
      truth.push([x - ox, y - oy], [x + ox, y + oy]);
    }
    const poly: [number, number][] = [[26, 50], [34, 50], [34, 90], [26, 90]];
    const find = (separate: 'distance' | 'overlap') => findLike(c, w, h, 30, 70, Math.hypot(4, 20), { ...MATCH_DEFAULTS, symmetry: 180, sizes: 0, separate, context: 'cluster', coarse: 11 }, poly);
    const hit = (f: { x: number; y: number }[]) => truth.filter(([x, y]) => f.some((m) => Math.hypot(m.x - x, m.y - y) < 3)).length;
    const [byDist, byOver] = [find('distance'), find('overlap')];
    const feats = matchFeatures(c, w, h, 30, 70, Math.hypot(4, 20), { ...MATCH_DEFAULTS, symmetry: 180, sizes: 0, context: 'cluster' }, byOver, poly);
    const sq = overlapOf([[0, 0], [10, 0], [10, 10], [0, 10]], [[5, 0], [15, 0], [15, 10], [5, 10]]);
    ok(hit(byOver) === truth.length && hit(byDist) <= truth.length / 2 + 1 && Math.abs(sq - 0.5) < 0.06 && feats.length === byOver.length && feats.every((f) => f.length === FEATURE_NAMES.length && f.every(Number.isFinite)) && feats.every((f, i) => Math.abs(f[0] - byOver[i].score) < 0.05), `Find like this ▸ Separate by overlap: rods side by side ${hit(byOver)} of ${truth.length} (by the distance ${hit(byDist)}); two squares half over each other ${sq.toFixed(2)}; the features of every place found`);
  }
  // the classifier on nanocubes touching (a gap of a pixel): three outlined, the edges made from their outlines, the
  // objects split by the edges — every cube apart, its size; without edges the clusters stay whole; where it hesitates
  {
    const t = cubesImage();
    const r: Raster = { w: t.w, h: t.h, ch: [Float32Array.from(t.px)], kind: 'gray', lo: 0, hi: 255 };
    const sq = (q: (typeof t.truth)[number]): [number, number][] => {
      const a = (-q.angle! * Math.PI) / 180;
      const h = q.side! / 2;
      return ([[-h, -h], [h, -h], [h, h], [-h, h]] as [number, number][]).map(([u, v]) => [q.cx + u * Math.cos(a) - v * Math.sin(a), q.cy + u * Math.sin(a) + v * Math.cos(a)]);
    };
    const train: TrainExample[] = [
      ...t.truth.filter((q) => q.cluster !== undefined).slice(0, 3).map((q): TrainExample => ({ cls: 'object', pts: sq(q), line: false, width: 1 })),
      { cls: 'background', pts: [[5, 5], [60, 5], [60, 15], [5, 15]], line: false, width: 1 },
      { cls: 'background', pts: [[400, 340], [470, 340], [470, 355], [400, 355]], line: false, width: 1 },
    ];
    const step = (p: Record<string, unknown>) => ({ ...newStep('classify', 'c'), p: { ...newStep('classify', 'c').p, ...p } });
    const count = (p: Record<string, unknown>) => {
      const a = applySteps(r, [step(p)], 1, undefined, 1, { train });
      return { a, f: findParticles(a.r.ch[0], t.w, t.h, { ...PARTICLE_DEFAULTS, minSize: 40 }) };
    };
    const plain = count({ edges: 0, output: 'mask' });
    const old = count({ edges: undefined, output: 'mask' });
    const split = count({ output: 'split' });
    const errs: number[] = [];
    for (const q of t.truth) {
      const o = split.f.outlines.find((pts) => Math.hypot(pts.reduce((m, p) => m + p[0], 0) / pts.length - q.cx, pts.reduce((m, p) => m + p[1], 0) / pts.length - q.cy) < q.side! * 0.4);
      if (o) errs.push(Math.abs(Math.sqrt(polygonArea(o)) / q.side! - 1));
    }
    errs.sort((x, y) => x - y);
    const med = errs[errs.length >> 1];
    const unsure = applySteps(r, [step({ output: 'uncertainty' })], 1, undefined, 1, { train }).r.ch[0];
    const at = (x: number, y: number) => unsure[Math.round(y) * t.w + Math.round(x)];
    // (sure inside the cubes, hesitating somewhere: at their edges)
    const sureInside = t.truth.filter((q) => at(q.cx, q.cy) < 0.5).length;
    ok(
      plain.f.found < 25 && old.f.found === plain.f.found && split.f.found >= 46 && split.f.found <= 48 && errs.length >= 45 && med < 0.03 && /edge: \d+ px → object; \d+ objects$/.test(split.a.notes.c ?? '') && unsure.every((v) => v >= 0 && v <= 1) && sureInside >= 0.9 * t.truth.length && unsure.reduce((m, v) => Math.max(m, v), 0) > 0.5,
      `classifier: 3 nanocubes outlined, the edges from their outlines, split by edges: ${split.f.found} of ${t.truth.length} apart (a mask without edges: ${plain.f.found}; an older step: none made); their side within ${(med * 100).toFixed(1)} % (median); sure inside ${sureInside} of them, hesitating at the edges`,
    );
    // the ring: around a square outlined 2 px wide outside it, none inside; the gap between two touching ones in it
    const ring = edgeRing([{ cls: 'o', pts: [[10, 10], [20, 10], [20, 20], [10, 20]], line: false, width: 1 }, { cls: 'o', pts: [[21, 10], [31, 10], [31, 20], [21, 20]], line: false, width: 1 }], 'o', 2, 40, 30);
    const has = (x: number, y: number) => ring.includes(y * 40 + x);
    ok(has(20, 15) && has(9, 15) && has(8, 15) && !has(7, 15) && !has(15, 15) && !has(25, 15), 'classifier: edges from outlines, a ring just outside them and the gap between two touching');
  }
  // nanocubes touching side to side (their place, side and turn known): found like one of them, at any turn, their
  // edges fitted; the mask cut along the dark lines between them; their smallest rectangle, its turn and the alignment
  {
    const t = cubesImage();
    const c = Float32Array.from(t.px);
    const tpl = t.truth.find((q) => q.cluster === undefined)!;
    const found = findLike(c, t.w, t.h, tpl.cx, tpl.cy, 0.5 * Math.hypot(tpl.side!, tpl.side!), { ...MATCH_DEFAULTS, sizes: 0.2 });
    let hit = 0;
    let angleErr = 0;
    let sideErr = 0;
    let sideSum = 0;
    let turnErr = 0;
    for (const q of t.truth) {
      const p = found.find((f) => Math.hypot(f.x - q.cx, f.y - q.cy) < 0.4 * q.side!);
      if (!p) continue;
      hit++;
      // (the model turned as the selections turn: the cube's sides at minus its turn as seen)
      const turn = -tpl.angle! + p.angle;
      const b = fitBox(c, t.w, t.h, p.x, p.y, turn, p.scale * tpl.side!, p.scale * tpl.side!);
      const e = Math.max(Math.abs(b.w - q.side!), Math.abs(b.h - q.side!)) / q.side!;
      sideErr = Math.max(sideErr, e);
      sideSum += e;
      const as = (((-turn % 90) + 90) % 90);
      angleErr = Math.max(angleErr, Math.min(Math.abs(as - q.angle!), 90 - Math.abs(as - q.angle!)));
      // (its selection measured: the smallest rectangle's turn is the cube's)
      const res = measureRois({ image: { w: t.w, h: t.h, ch: [c], kind: 'gray', lo: 0, hi: 255 }, mask: null, ox: 0, oy: 0, rois: [{ id: 'm', name: 'm', kind: 'rect', box: [b.x, b.y, b.w, b.h], angle: turn }], spec: measureSpec({ keys: ['box'] }), name: 't' });
      const o = res.book.sheets[0].columns.find((x) => x.name === 'Orientation (°)')!.values[0];
      turnErr = Math.max(turnErr, Math.min(Math.abs(o - q.angle!), 90 - Math.abs(o - q.angle!)));
    }
    const r: Raster = { w: t.w, h: t.h, ch: [c], kind: 'gray', lo: 0, hi: 255 };
    const otsu = { ...newStep('threshold', 'o'), p: { ...newStep('threshold', 'o').p, method: 'otsu' } };
    const whole = findParticles(applySteps(r, [otsu]).r.ch[0], t.w, t.h, PARTICLE_DEFAULTS).found;
    const split = findParticles(applySteps(r, [otsu, newStep('splitlines', 's')]).r.ch[0], t.w, t.h, { ...PARTICLE_DEFAULTS, minSize: 40 }).found;
    const box = minAreaRect([
      [0, 0],
      [8, 0],
      [8, 3],
      [0, 3],
    ].map(([x, y]): [number, number] => [x * Math.cos(0.5) - y * Math.sin(0.5), x * Math.sin(0.5) + y * Math.cos(0.5)]));
    const same = alignment([10, 12, 8, 11], 4);
    const spread = alignment([0, 22.5, 45, 67.5], 4);
    ok(
      hit === t.truth.length && found.length === t.truth.length && angleErr < 2 && sideErr < 0.04 && sideSum / hit < 0.02 && turnErr < 2 && whole < 30 && split === t.truth.length && Math.abs(box.length - 8) < 1e-9 && Math.abs(box.width - 3) < 1e-9 && Math.abs(box.angle - (180 - (0.5 * 180) / Math.PI)) < 1e-9 && same.order > 0.98 && Math.abs(same.mean - 10.25) < 0.1 && spread.order < 1e-9,
      `nanocubes: ${hit} of ${t.truth.length} found like one (turn within ${angleErr.toFixed(1)}°, side within ${(100 * sideErr).toFixed(1)} % once its edges are fitted, the box's orientation within ${turnErr.toFixed(1)}°); the mask cut along the dark lines: ${split} (Otsu alone: ${whole}); the smallest rectangle, the alignment`,
    );
  }

  // the same cubes three times larger (a model of ~45 px in radius, as on an electron microscope's image): found through
  // the levels between the image shrunk and the full size, every one, their place and turn as sharp
  {
    const t = cubesImage();
    const k = 3;
    const [w, h] = [t.w * k, t.h * k];
    const c = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [fx, fy] = [Math.min(t.w - 1, Math.max(0, (x + 0.5) / k - 0.5)), Math.min(t.h - 1, Math.max(0, (y + 0.5) / k - 0.5))];
        const [x0, y0] = [Math.floor(fx), Math.floor(fy)];
        const [x1, y1] = [Math.min(t.w - 1, x0 + 1), Math.min(t.h - 1, y0 + 1)];
        const [tx, ty] = [fx - x0, fy - y0];
        c[y * w + x] = (t.px[y0 * t.w + x0] * (1 - tx) + t.px[y0 * t.w + x1] * tx) * (1 - ty) + (t.px[y1 * t.w + x0] * (1 - tx) + t.px[y1 * t.w + x1] * tx) * ty;
      }
    const tpl = t.truth.find((q) => q.cluster === undefined)!;
    const t0 = performance.now();
    // (a least similarity of 0.6: the enlarged image's edge makes one place of 0.54, the full search's as well)
    const found = findLike(c, w, h, tpl.cx * k, tpl.cy * k, 0.5 * Math.hypot(tpl.side! * k, tpl.side! * k), { ...MATCH_DEFAULTS, sizes: 0.2, min: 0.6 });
    const ms = performance.now() - t0;
    let [hit, placeErr, angleErr] = [0, 0, 0];
    for (const q of t.truth) {
      const p = found.find((f) => Math.hypot(f.x - q.cx * k, f.y - q.cy * k) < 0.4 * q.side! * k);
      if (!p) continue;
      hit++;
      placeErr = Math.max(placeErr, Math.hypot(p.x - q.cx * k, p.y - q.cy * k) / k);
      const as = (((-(-tpl.angle! + p.angle) % 90) + 90) % 90);
      angleErr = Math.max(angleErr, Math.min(Math.abs(as - q.angle!), 90 - Math.abs(as - q.angle!)));
    }
    // (and in the particle's shape, only it and its edge compared: the region read from its grid at every level)
    const th = (-tpl.angle! * Math.PI) / 180;
    const hs = (tpl.side! * k) / 2;
    const poly = ([[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]] as Pt[]).map(([u, v]): Pt => [tpl.cx * k + u * Math.cos(th) - v * Math.sin(th), tpl.cy * k + u * Math.sin(th) + v * Math.cos(th)]);
    const t1 = performance.now();
    const shaped = findLike(c, w, h, tpl.cx * k, tpl.cy * k, 1, { ...MATCH_DEFAULTS, sizes: 0.2, context: 'cluster' }, poly);
    const ms2 = performance.now() - t1;
    const hit2 = t.truth.filter((q) => shaped.some((f) => Math.hypot(f.x - q.cx * k, f.y - q.cy * k) < 0.4 * q.side! * k)).length;
    ok(hit === t.truth.length && found.length === t.truth.length && placeErr < 1 && angleErr < 2 && hit2 === t.truth.length && shaped.length === t.truth.length, `Find like this, a large model (the cubes ×3, ${w} × ${h} px): ${hit} of ${t.truth.length} found through the levels, none more (in ${(ms / 1000).toFixed(1)} s); their place within ${placeErr.toFixed(2)} px of the original's, their turn within ${angleErr.toFixed(1)}°; in the particle's shape (in clusters) ${hit2} of them, none more (in ${(ms2 / 1000).toFixed(1)} s)`);
  }

  {
    // ---- Segment anything: the image made the encoder's input and a mask of the decoder enlarged to the image, against
    // PyTorch as Segment Anything's predictor does them (scripts/fixtures/sam-ref.py) ----
    type R = { w: number; h: number; nw: number; nh: number; at: [number, number][]; resized: number[]; input: number[]; maskArea: number; maskRows: number[][] };
    const ref = JSON.parse(readFileSync(new URL('./fixtures/sam-ref.json', import.meta.url), 'utf8')) as Record<string, R>;
    for (const [name, r] of Object.entries(ref)) {
      const img = new Float32Array(r.w * r.h);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) img[y * r.w + x] = Math.fround(127 + 100 * Math.sin(x / 7) * Math.cos(y / 11) + 20 * ((Math.floor(x / 37) + Math.floor(y / 23)) % 2));
      const [nw, nh] = samSize(r.w, r.h);
      const rs = resizeAA(img, r.w, r.h, nw, nh);
      let [lo, hi] = [Infinity, -Infinity];
      for (const v of img) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
      const inp = samInput([img], r.w, r.h, lo, hi);
      let [errR, errI] = [0, 0];
      r.at.forEach(([x, y], i) => {
        errR = Math.max(errR, Math.abs(rs[y * nw + x] - r.resized[i]));
        errI = Math.max(errI, Math.abs(inp[y * 1024 + x] - r.input[i]));
      });
      // (the rest of the square 0; the three channels of a gray image its gray made standard each)
      const pad = (nh < 1024 ? inp[nh * 1024] === 0 : true) && (nw < 1024 ? inp[nw] === 0 : true) && inp[2 * 1024 * 1024 + 5] !== inp[5];
      const m = new Float32Array(256 * 256);
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) m[y * 256 + x] = Math.fround(-3 + 6 * Math.exp(-((x - 60) ** 2 + (y - 50) ** 2) / 300) + 5 * Math.exp(-((x - 150) ** 2 + (y - 70) ** 2) / 900) + 0.8 * Math.sin(x / 9));
      const mk = maskOver(m, 0, r.w, r.h);
      const area = mk.mask.reduce((a, v) => a + v, 0);
      // (every 20th row: where the mask starts and ends along it, within 2 px of PyTorch's)
      const step = Math.max(1, Math.floor(r.h / 20));
      let rowErr = 0;
      r.maskRows.forEach((edges, k) => {
        const y = k * step;
        const mine: number[] = [];
        for (let x = 0; x <= r.w; x++) {
          const [a, b] = [x > 0 ? mk.mask[y * r.w + x - 1] : 0, x < r.w ? mk.mask[y * r.w + x] : 0];
          if (a !== b) mine.push(x);
        }
        if (mine.length !== edges.length) rowErr = Infinity;
        else mine.forEach((v, i) => (rowErr = Math.max(rowErr, Math.abs(v - edges[i]))));
      });
      const areaErr = Math.abs(area - r.maskArea) / r.maskArea;
      ok(nw === r.nw && nh === r.nh && errR < 2e-3 && errI < 2e-5 && pad && areaErr < 0.01 && rowErr <= 2, `Segment anything, an image ${name} (${r.w} × ${r.h} to ${nw} × ${nh}): resized as PyTorch's bilinear with antialias within ${errR.toExponential(1)}, the encoder's input within ${errI.toExponential(1)}, padded with 0; a mask of the decoder enlarged to the image: its area within ${(areaErr * 100).toFixed(2)} % of PyTorch's, its edges within ${rowErr} px`);
    }
    // the prompts: a click and its padding point, a box's corners (labels 2, 3), in the encoder's square
    const pc = samPoints(2048, 1024, [[1000, 500, 1]]);
    const pb = samPoints(2048, 1024, [], [100, 200, 300, 400]);
    ok(pc.n === 2 && pc.coords[0] === 500 && pc.coords[1] === 250 && pc.labels[1] === -1 && pb.n === 2 && pb.labels[0] === 2 && pb.labels[1] === 3 && pb.coords[2] === 150, 'Segment anything: a click given with the padding point the predictor adds, a box as its two corners (labels 2 and 3), both in the square of 1024');
    ok(pickMask([0.9, 0.5, 0.8, 0.7], 0, 2) === 2 && pickMask([0.9, 0.5, 0.8, 0.7], 0, 3) === 0, 'Segment anything: one point (or a box), the surest of its three masks; more points, the single mask (as the ONNX model of Segment Anything)');
    // Everything: the sure and stable ones, the overlapping one dropped; the cluster of two particles and the piece of one
    const c: SamCandidate[] = [
      { iou: 0.95, stability: 0.97, box: [10, 10, 30, 30], area: 300, edge: false },
      { iou: 0.93, stability: 0.96, box: [11, 10, 30, 31], area: 290, edge: false },
      { iou: 0.7, stability: 0.99, box: [50, 50, 60, 60], area: 80, edge: false },
      { iou: 0.95, stability: 0.8, box: [70, 70, 90, 90], area: 300, edge: false },
      { iou: 0.92, stability: 0.95, box: [0, 100, 20, 120], area: 300, edge: true },
    ];
    const kept = keepMasks(c, SAM_DEFAULTS, 1024, 1024);
    const keptEdges = keepMasks(c, { ...SAM_DEFAULTS, edges: true }, 1024, 1024);
    ok(kept.join() === '0,4' && keptEdges.join() === '0', 'Segment anything, Everything: the masks the model is sure of and that are stable kept, of two alike (their boxes) the surer one, those on the edge left out when asked');
    const disc = (cx: number, cy: number, r: number) => Uint8Array.from({ length: 64 * 64 }, (_, i) => (Math.hypot((i % 64) - cx, Math.floor(i / 64) - cy) <= r ? 1 : 0));
    const two = Uint8Array.from(disc(20, 20, 8), (v, i) => v | disc(38, 20, 8)[i]);
    const nested = dropNested([two, disc(20, 20, 8), disc(38, 20, 8), disc(20, 48, 9), disc(22, 48, 3)]);
    ok(nested.join() === '1,2,3', 'Segment anything, Everything: a mask holding two particles kept (a cluster) left out for them; a piece inside one particle left out');
    const square = maskOutline({ mask: Float32Array.from({ length: 40 * 30 }, (_, i) => ((i % 40) >= 10 && (i % 40) < 30 && i / 40 >= 5 && i / 40 < 25 ? 1 : 0)), x0: 100, y0: 200, mw: 40, mh: 30 });
    const sa = square ? Math.abs(polygonArea(square)) : 0;
    ok(!!square && Math.abs(sa - 400) < 30 && square.every(([x, y]) => x >= 109 && x <= 131 && y >= 204 && y <= 226), `Segment anything: a mask made an outline in pixels of the image (a square of 20 × 20 px: area ${sa.toFixed(0)})`);
  }

  {
    // ---- Review of the particles of any way: what is known of each, and whether it is left out ----
    const [w, h] = [120, 80];
    const g = new Float32Array(w * h).fill(20);
    const disc = (cx: number, cy: number, r: number, v: number) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) g[y * w + x] = v;
    };
    disc(30, 40, 12, 200);
    disc(90, 40, 6, 60);
    const circle = (cx: number, cy: number, r: number): Pt[] => Array.from({ length: 64 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 32), cy + r * Math.sin((i * Math.PI) / 32)]);
    const f = particleFeatures([circle(30, 40, 12), circle(90, 40, 6)], g, w, h, 0, 255, [0.97, undefined]);
    const [a, b] = f;
    ok(f.length === 2 && a.length === PARTICLE_FEATURES.length && Math.abs(a[0] - Math.log(Math.PI * 144)) < 0.05 && a[1] > 0.95 && Math.abs(a[2] - 200 / 255) < 0.02 && a[3] > b[3] && b[3] > 0 && a[4] > b[4] && a[5] < 0.02 && Math.abs(a[6] - 60 / 12) < 0.1 && a[7] === 0.97 && b[7] === 1, `Review, the features of a particle (${PARTICLE_FEATURES.join(', ')}): a bright disc of radius 12 and a dim one of 6, 60 px apart: size ${a[0].toFixed(2)} (ln of its area), roundness ${a[1].toFixed(2)}, mean ${a[2].toFixed(2)}, contrast ${a[3].toFixed(2)} against ${b[3].toFixed(2)}, the nearest ${a[6].toFixed(2)} radii, how sure Segment anything is (1 when not found by it)`);
    const r = (p: Partial<Roi>): Roi => ({ id: 's1', name: 'P1', kind: 'traced', auto: true, score: 0.9, ...p });
    ok(outOf(r({}), undefined, 0.5, 0) === undefined && outOf(r({ out: 'hand' }), undefined, 0.5, 0) === 'hand' && outOf(r({ said: false }), 0.9, 0.5, 0) === 'said' && outOf(r({ said: true, out: 'hand' }), 0.1, 0.5, 0.95) === undefined && outOf(r({}), 0.3, 0.5, 0) === 'learnt' && outOf(r({}), 0.8, 0.5, 0.95) === 'score' && outOf(r({ id: 'p1' }), 0.8, 0.5, 0.95) === undefined, 'Review: a particle said good kept whatever else; said not good, left out; left out by a click; less probable than asked by what was learnt; Segment anything less sure of it than asked (only its own particles)');
  }

  {
    // ---- the paint of the classifier: painted, kept as runs and read back, made examples in the part analysed ----
    const l = emptyPaint(200, 100);
    const obj = classIndex(l, 'object');
    const bg = classIndex(l, 'background');
    paintSegment(l, [20, 20], [80, 20], 5, obj);
    paintFill(l, [[100, 40], [180, 40], [180, 90], [100, 90]], bg);
    paintSegment(l, [140, 30], [140, 95], 3, 0);
    const n = paintCounts(l);
    // (a stroke 60 px long, 10 wide with round ends: about 60 × 10 + π 5²; the box 80 × 50 less the band erased, 6 wide)
    const st = encodePaint(l);
    const back = decodePaint(st);
    const same = back.px.every((v, i) => v === l.px[i]) && back.classes.join() === 'object,background';
    const ex = paintExamples(st, [10, 10, 150, 80]);
    const exObj = ex.find((e) => e.cls === 'object');
    const inCrop = (() => {
      let k = 0;
      for (let y = 10; y < 90; y++) for (let x = 10; x < 160; x++) if (l.px[y * 200 + x] === obj) k++;
      return k;
    })();
    ok(Math.abs(n.object - (600 + Math.PI * 25)) < 40 && Math.abs(n.background - (80 * 50 - 6 * 50)) < 120 && same && st.rle.length < 1000 && !!exObj && exObj.px!.length === inCrop && exObj.pw === 150 && exObj.px!.every((i) => l.px[(Math.floor(i / 150) + 10) * 200 + (i % 150) + 10] === obj) && ex.every((e) => !!e.key), `Classifier paint: a brush stroke (${n.object} px), a fill (${n.background} px) with a band erased, kept as runs (${st.rle.length} characters) and read back the same; its examples in the part analysed, their pixels where the paint is`);
    // (an outline of a mask, a staircase, thinned to the points that matter: a square stays a square)
    const stairs: Pt[] = [];
    for (let x = 0; x < 20; x++) stairs.push([x, 0]);
    for (let y = 0; y < 20; y++) stairs.push([20, y]);
    for (let x = 20; x > 0; x--) stairs.push([x, 20]);
    for (let y = 20; y > 0; y--) stairs.push([0, y]);
    const thin = thinOutline(stairs);
    ok(thin.length === 4 && Math.abs(Math.abs(polygonArea(thin)) - 400) < 1e-9, `Segment anything, Pick with SAM: an outline of ${stairs.length} points thinned to the corners of the square (${thin.length})`);
  }
}
