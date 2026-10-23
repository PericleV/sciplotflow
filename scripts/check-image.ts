// The checks of the Image analysis node's algorithms against scikit-image / scipy (scripts/fixtures/image-ref.py →
// image-ref.json), and properties where there is no reference (skeleton, watershed, the ImageJ thresholds).
import { readFileSync } from 'node:fs';
import { cropRaster, dataBarRows, gaussian, gaussianWide, packPixels, quantile, shrinkRaster, unpackPixels, type Raster } from '../src/image/raster.ts';
import { semScale } from '../src/image/load.ts';
import { measureRois, measureSpec, valueStats, feret, lineProfile } from '../src/image/measure.ts';
import { nearRoi, offsetDistance, offsetOutline, ringMask, roiMask, traceOutline, wand, polygonArea, type Roi } from '../src/image/roi.ts';
import { alignment, findParticles, groupLikeExamples, minAreaRect, PARTICLE_DEFAULTS, shapeFeatures, shapeName, tracedPerimeter } from '../src/image/particles.ts';
import { findLike, fitBox, MATCH_DEFAULTS } from '../src/image/match.ts';
import { clustersImage, cubesImage, shapesImage, textureImage, type TestImage } from '../src/image/testImages.ts';
import { edgeRing, type TrainExample } from '../src/image/classify.ts';
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
}
