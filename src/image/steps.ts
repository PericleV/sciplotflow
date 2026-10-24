// The editing steps of the Image analysis node: what each one is (its group, name, parameters with their defaults) and
// what it does to a raster. The steps are applied in their order, each on what the ones above gave; a step that cannot
// run says why and is passed over. Pure.
import { gaussian, gaussianWide, luminance, map1, type Raster } from './raster.ts';
import { anisotropic, bilateral, entropyFilter, frangi, gabor, gradient, hessianEigen, laplace, laplacianOfGaussian, lbp, meanFilter, medianFilter, minMaxFilter, nonLocalMeans, removeOutliers, rollingBall, scanLines, slidingParaboloid, varianceFilter, type Shape } from './filters.ts';
import { autoContrast, balance, brightness, clahe, contrast, curves, equalize, hueSaturation, invert, levels, logTone, minMax, pickChannel, weightedGray, type ChannelPick } from './tone.ts';
import { closing, dilate, distanceMap, erode, fillHoles, opening, separate, skeleton, topHat } from './morph.ts';
import { canny } from './canny.ts';
import { bandpass, spotMask } from './fft2d.ts';
import { levelSurface } from './surface.ts';
import { GLOBAL_METHODS, LOCAL_METHODS, globalThreshold, localThreshold, type GlobalMethod, type LocalMethod } from './threshold.ts';
import { classifyPixels, edgeClassOf, splitByEdges, uncertainty, type TrainExample } from './classify.ts';

export type StepGroup = 'Tone' | 'Colour' | 'Noise' | 'Background' | 'Frequency' | 'Edges' | 'Texture' | 'Morphology' | 'Threshold';
export const STEP_GROUPS: StepGroup[] = ['Tone', 'Colour', 'Noise', 'Background', 'Frequency', 'Edges', 'Texture', 'Morphology', 'Threshold'];

// A parameter: a number (in pixels, % or the image's values — NaN: automatic), a choice, a tick, or a curve's points
export type Param =
  | { key: string; label: string; type: 'num'; def: number; min?: number; max?: number; step?: number; unit?: string; auto?: string; title?: string }
  | { key: string; label: string; type: 'choice'; def: string; options: [string, string][]; title?: string }
  | { key: string; label: string; type: 'bool'; def: boolean; title?: string }
  | { key: string; label: string; type: 'curve'; def: [number, number][]; title?: string }
  // spots of the spectrum (fx, fy: cycles per pixel), picked in the Lattice tab
  | { key: string; label: string; type: 'spots'; def: [number, number][]; title?: string };
export type StepDef = { group: StepGroup; label: string; title: string; params: Param[] };

const num = (key: string, label: string, def: number, o: Partial<Extract<Param, { type: 'num' }>> = {}): Param => ({ key, label, type: 'num', def, ...o });
const choice = (key: string, label: string, def: string, options: [string, string][], title?: string): Param => ({ key, label, type: 'choice', def, options, ...(title ? { title } : {}) });
const bool = (key: string, label: string, def: boolean, title?: string): Param => ({ key, label, type: 'bool', def, ...(title ? { title } : {}) });
const SHAPE = choice('shape', 'Shape', 'disk', [
  ['disk', 'disk'],
  ['square', 'square'],
]);
const radius = (def = 2) => num('radius', 'Radius', def, { min: 0.5, step: 0.5, unit: 'px' });

export const STEP_DEFS = {
  // tone
  brightness: { group: 'Tone', label: 'Brightness', title: 'Every value moved up or down by a fraction of the range', params: [num('amount', 'Amount', 0, { min: -1, max: 1, step: 0.01, title: '−1 … 1: a fraction of the range' })] },
  contrast: { group: 'Tone', label: 'Contrast', title: 'The values spread from (or drawn to) the middle of the range', params: [num('factor', 'Factor', 1.2, { min: 0, step: 0.05 })] },
  minmax: { group: 'Tone', label: 'Min / max', title: 'The values from min to max stretched over the whole range, the others clipped', params: [num('min', 'Min', NaN, { unit: 'value', auto: 'lowest' }), num('max', 'Max', NaN, { unit: 'value', auto: 'highest' })] },
  levels: {
    group: 'Tone',
    label: 'Levels',
    title: 'Input black and white points, gamma (> 1 lightens the middle), output black and white',
    params: [num('inB', 'In black', NaN, { unit: 'value', auto: 'range start' }), num('inW', 'In white', NaN, { unit: 'value', auto: 'range end' }), num('gamma', 'Gamma', 1, { min: 0.05, step: 0.05 }), num('outB', 'Out black', NaN, { unit: 'value', auto: 'range start' }), num('outW', 'Out white', NaN, { unit: 'value', auto: 'range end' })],
  },
  curves: {
    group: 'Tone',
    label: 'Curves',
    title: 'A curve from the input to the output value, drawn over the histogram of what comes in (a click on it adds a point, drag it; double-click or drag it out: taken off); RGB: the curve of all the channels, then one for each',
    params: [
      { key: 'points', label: 'Curve', type: 'curve', def: [[0, 0], [1, 1]] },
      { key: 'r', label: 'R', type: 'curve', def: [[0, 0], [1, 1]] },
      { key: 'g', label: 'G', type: 'curve', def: [[0, 0], [1, 1]] },
      { key: 'b', label: 'B', type: 'curve', def: [[0, 0], [1, 1]] },
    ],
  },
  autocontrast: { group: 'Tone', label: 'Auto-contrast', title: 'The darkest and brightest few % clipped, the rest stretched', params: [num('saturated', 'Saturated', 0.35, { min: 0, max: 50, step: 0.05, unit: '%' })] },
  equalize: { group: 'Tone', label: 'Equalize', title: 'The histogram made flat (every level used as often)', params: [] },
  clahe: { group: 'Tone', label: 'CLAHE', title: 'Contrast-limited adaptive equalisation: tile by tile, the histogram clipped so noise is not amplified', params: [num('tile', 'Tile', 64, { min: 4, step: 1, unit: 'px' }), num('clip', 'Clip limit', 3, { min: 1, step: 0.5, title: '× the mean count of a bin' }), num('bins', 'Bins', 256, { min: 8, step: 1 })] },
  log: { group: 'Tone', label: 'Log', title: 'The dark values spread (logarithm); strength k', params: [num('k', 'Strength', 10, { min: 0.1, step: 1 })] },
  exp: { group: 'Tone', label: 'Exp', title: 'The bright values spread (the inverse of Log)', params: [num('k', 'Strength', 10, { min: 0.1, step: 1 })] },
  invert: { group: 'Tone', label: 'Invert', title: 'Dark and bright swapped', params: [] },
  // colour
  channel: {
    group: 'Colour',
    label: 'Channel',
    title: 'One channel of an RGB image as a gray one',
    params: [
      choice('which', 'Channel', 'luma', [
        ['luma', 'gray (luminance)'],
        ['average', 'gray (average)'],
        ['r', 'R'],
        ['g', 'G'],
        ['b', 'B'],
        ['h', 'H (hue)'],
        ['s', 'S (saturation)'],
        ['v', 'V (value)'],
        ['L', 'L* (lightness)'],
        ['a', 'a* (green–red)'],
        ['bb', 'b* (blue–yellow)'],
      ]),
    ],
  },
  grayweights: { group: 'Colour', label: 'Gray from weights', title: 'Gray as a weighted sum of R, G, B', params: [num('wr', 'R', 0.299, { step: 0.01 }), num('wg', 'G', 0.587, { step: 0.01 }), num('wb', 'B', 0.114, { step: 0.01 })] },
  huesat: { group: 'Colour', label: 'Hue / saturation', title: 'The hue turned, the saturation scaled', params: [num('hue', 'Hue', 0, { step: 1, unit: '°' }), num('sat', 'Saturation', 1, { min: 0, step: 0.05 })] },
  balance: { group: 'Colour', label: 'Colour balance', title: 'Each channel scaled', params: [num('r', 'R', 1, { min: 0, step: 0.05 }), num('g', 'G', 1, { min: 0, step: 0.05 }), num('b', 'B', 1, { min: 0, step: 0.05 })] },
  // noise
  gaussian: { group: 'Noise', label: 'Gaussian blur', title: 'Smoothed by a Gaussian', params: [num('sigma', 'σ', 1, { min: 0.1, step: 0.1, unit: 'px' })] },
  median: { group: 'Noise', label: 'Median', title: 'Each pixel the median of its neighbourhood: removes specks, keeps edges', params: [radius(1), SHAPE] },
  mean: { group: 'Noise', label: 'Mean', title: 'Each pixel the mean of its neighbourhood', params: [radius(1), SHAPE] },
  bilateral: { group: 'Noise', label: 'Bilateral', title: 'Smoothed among similar values only: edges kept', params: [num('sigmaS', 'σ space', 2, { min: 0.5, step: 0.5, unit: 'px' }), num('sigmaR', 'σ value', NaN, { unit: 'value', auto: '10 % of the range' })] },
  nlm: {
    group: 'Noise',
    label: 'Non-local means',
    title: 'Each pixel the mean of pixels whose surroundings look alike: strong denoising that keeps texture (SEM)',
    params: [num('h', 'h (strength)', NaN, { unit: 'value', auto: 'from the noise' }), num('patch', 'Patch', 3, { min: 1, step: 1, unit: 'px', title: 'Half-size of the patches compared' }), num('search', 'Search', 5, { min: 1, step: 1, unit: 'px', title: 'Half-size of the window searched' })],
  },
  anisotropic: {
    group: 'Noise',
    label: 'Anisotropic diffusion',
    title: 'Smoothing that stops at edges (Perona–Malik)',
    params: [num('iterations', 'Iterations', 10, { min: 1, step: 1 }), num('kappa', 'κ (edge)', NaN, { unit: 'value', auto: '5 % of the range' }), num('stepSize', 'Step', 0.2, { min: 0.01, max: 0.25, step: 0.01 }), choice('option', 'Conduction', '1', [['1', 'exp (favours high-contrast edges)'], ['2', '1 / (1 + x²) (favours wide regions)']])],
  },
  outliers: { group: 'Noise', label: 'Remove outliers', title: 'Pixels brighter (darker) than the median around them by more than the threshold take the median', params: [radius(2), num('threshold', 'Threshold', NaN, { unit: 'value', auto: '20 % of the range' }), choice('which', 'Which', 'bright', [['bright', 'bright'], ['dark', 'dark'], ['both', 'both']])] },
  scanlines: { group: 'Noise', label: 'Scan lines', title: 'The offset of every line removed (the bands of a scanned image: SEM, AFM)', params: [choice('along', 'Lines', 'rows', [['rows', 'rows'], ['cols', 'columns']]), choice('how', 'Level', 'median', [['median', 'median'], ['mean', 'mean']])] },
  // frequency (the image's Fourier transform)
  bandpass: {
    group: 'Frequency',
    label: 'Band-pass',
    title: 'Structures larger and smaller than two sizes taken out in the spectrum (as ImageJ’s Bandpass filter): an uneven background and the finest noise; stripes along a direction too',
    params: [
      num('large', 'Larger than', 40, { min: 2, step: 1, unit: 'px', title: 'Structures larger than this taken out (the background)' }),
      num('small', 'Smaller than', 3, { min: 0, step: 0.5, unit: 'px', title: 'Structures smaller than this taken out (the noise; 0: none)' }),
      choice('stripes', 'Stripes', 'none', [
        ['none', 'kept'],
        ['h', 'horizontal out'],
        ['v', 'vertical out'],
      ]),
      num('tol', 'Of direction', 5, { min: 0.5, max: 50, step: 0.5, unit: '%', title: 'How near the direction of the stripes (in %)' }),
    ],
  },
  fftmask: {
    group: 'Frequency',
    label: 'Spectrum mask',
    title: 'Spots of the spectrum (picked in the Lattice tab) taken out (a periodic noise, a moiré) or the only ones kept (a Bragg filter: the lattice alone, its fringes clean)',
    params: [
      choice('mode', 'The spots', 'keep', [
        ['keep', 'kept (Bragg filter)'],
        ['remove', 'taken out'],
      ]),
      { key: 'spots', label: 'Spots', type: 'spots', def: [], title: 'Picked in the Lattice tab (with their mirror spots)' },
      num('area', 'Averaged over', 32, { min: 4, step: 1, unit: 'px', title: 'The size of the region the lattice is averaged over: larger, the spots narrower (a cleaner lattice, less of its local changes)' }),
    ],
  },
  // background
  level: {
    group: 'Background',
    label: 'Level',
    title: 'The form of a surface taken off (AFM): a plane or a polynomial fitted by least squares and subtracted; the highest part left out of the fit (particles on a substrate: the substrate levelled)',
    params: [
      choice('order', 'Fit', '1', [
        ['1', 'a plane'],
        ['2', 'a polynomial of order 2'],
        ['3', 'a polynomial of order 3'],
      ]),
      num('exclude', 'Leave out the highest', 0, { min: 0, max: 90, step: 1, unit: '%', title: 'The highest % of the surface (after a first fit) left out of the fit: what stands on the substrate' }),
      choice('zero', 'Zero at', 'mean', [
        ['mean', 'the mean'],
        ['min', 'the lowest point'],
        ['keep', 'the mean as it was'],
      ]),
    ],
  },
  rollingball: { group: 'Background', label: 'Rolling ball', title: 'The background under the image (a ball rolled under it) subtracted, or shown', params: [num('radius', 'Radius', 25, { min: 1, step: 1, unit: 'px', title: 'Larger than the largest object' }), bool('light', 'Light background', false), choice('output', 'Result', 'subtract', [['subtract', 'image − background'], ['background', 'the background']])] },
  paraboloid: { group: 'Background', label: 'Sliding paraboloid', title: 'As the rolling ball, with a paraboloid slid along the lines', params: [num('radius', 'Radius', 25, { min: 1, step: 1, unit: 'px' }), bool('light', 'Light background', false), choice('output', 'Result', 'subtract', [['subtract', 'image − background'], ['background', 'the background']])] },
  subgauss: { group: 'Background', label: 'Subtract Gaussian', title: 'A very smoothed copy subtracted (slow variations removed)', params: [num('sigma', 'σ', 20, { min: 1, step: 1, unit: 'px' })] },
  flatfield: { group: 'Background', label: 'Flat-field', title: 'Divided by a very smoothed copy (uneven illumination evened out), scaled back to its mean', params: [num('sigma', 'σ', 30, { min: 1, step: 1, unit: 'px' })] },
  // edges
  unsharp: { group: 'Edges', label: 'Unsharp mask', title: 'Edges sharpened: the image plus amount × (image − its blur)', params: [num('sigma', 'σ', 2, { min: 0.1, step: 0.1, unit: 'px' }), num('amount', 'Amount', 1, { min: 0, step: 0.1 })] },
  gradient: {
    group: 'Edges',
    label: 'Gradient',
    title: 'How fast the values change: Sobel, Prewitt or Scharr',
    params: [choice('op', 'Operator', 'sobel', [['sobel', 'Sobel'], ['prewitt', 'Prewitt'], ['scharr', 'Scharr']]), choice('part', 'Output', 'magnitude', [['magnitude', 'magnitude'], ['x', 'X'], ['y', 'Y']])],
  },
  laplace: { group: 'Edges', label: 'Laplacian', title: 'The second derivative (4 neighbours): edges as zero crossings', params: [] },
  logfilter: { group: 'Edges', label: 'LoG', title: 'Laplacian of Gaussian: spots and edges at the scale σ', params: [num('sigma', 'σ', 2, { min: 0.3, step: 0.1, unit: 'px' }), bool('negate', 'Bright spots positive', true)] },
  dog: { group: 'Edges', label: 'DoG', title: 'Difference of Gaussians: details between two sizes (band-pass)', params: [num('s1', 'σ small', 1, { min: 0.3, step: 0.1, unit: 'px' }), num('s2', 'σ large', 3, { min: 0.3, step: 0.1, unit: 'px' })] },
  canny: { group: 'Edges', label: 'Canny', title: 'Thin edges (a mask): smoothed, gradient, hysteresis between two thresholds', params: [num('sigma', 'σ', 1.5, { min: 0.3, step: 0.1, unit: 'px' }), num('low', 'Low', 0.1, { min: 0, step: 0.01, title: 'A fraction of the range' }), num('high', 'High', 0.2, { min: 0, step: 0.01, title: 'A fraction of the range' })] },
  ridges: {
    group: 'Edges',
    label: 'Ridges (Frangi)',
    title: 'Thin lines brought out, at several widths (as Frangi’s filter): the dark gaps between touching particles, or bright lines; 0 … 1',
    params: [choice('kind', 'Lines', 'dark', [['dark', 'dark (gaps)'], ['bright', 'bright']]), num('smin', 'Width from', 1, { min: 0.3, step: 0.1, unit: 'px', title: 'The thinnest lines (σ of the Gaussian)' }), num('smax', 'to', 3, { min: 0.3, step: 0.1, unit: 'px', title: 'The widest lines' })],
  },
  edgesub: {
    group: 'Edges',
    label: 'Edges subtracted',
    title: 'The image minus its edges (the gradient, scaled to its range): every edge becomes a valley, so a threshold or a watershed keeps touching particles apart',
    params: [num('sigma', 'σ', 1, { min: 0.3, step: 0.1, unit: 'px', title: 'The edges smoothed at this scale first' }), num('k', 'Strength', 1, { min: 0, step: 0.1, title: 'How much of the edges is taken off (1: as much as the image’s range)' })],
  },
  hessian: { group: 'Edges', label: 'Hessian', title: 'Ridges and valleys (filaments, fibres): an eigenvalue of the Hessian at the scale σ', params: [num('sigma', 'σ', 2, { min: 0.3, step: 0.1, unit: 'px' }), choice('which', 'Eigenvalue', 'smaller', [['smaller', 'smaller (bright ridges)'], ['larger', 'larger (dark valleys)']])] },
  // texture
  localsd: { group: 'Texture', label: 'Local SD', title: 'The standard deviation (or variance) around every pixel', params: [radius(3), SHAPE, bool('variance', 'Variance', false)] },
  entropy: { group: 'Texture', label: 'Local entropy', title: 'How varied the values are around every pixel (bits)', params: [radius(3)] },
  range: { group: 'Texture', label: 'Local range', title: 'Highest minus lowest around every pixel', params: [radius(2), SHAPE] },
  gabor: { group: 'Texture', label: 'Gabor', title: 'The response to stripes of a frequency and an angle (the magnitude)', params: [num('frequency', 'Frequency', 0.2, { min: 0.01, max: 0.5, step: 0.01, unit: '1/px' }), num('theta', 'Angle', 0, { step: 5, unit: '°' }), num('bandwidth', 'Bandwidth', 1, { min: 0.1, step: 0.1 })] },
  lbp: { group: 'Texture', label: 'LBP', title: 'Local binary patterns: the kind of texture at every pixel (uniform codes 0 … P + 1)', params: [num('points', 'Points', 8, { min: 4, step: 1 }), num('radius', 'Radius', 1, { min: 1, step: 0.5, unit: 'px' })] },
  // morphology
  morph: { group: 'Morphology', label: 'Erode / dilate / open / close', title: 'The minimum (erode) or maximum (dilate) around every pixel; open: erode then dilate (small bright things removed); close: the reverse', params: [choice('op', 'Operation', 'open', [['erode', 'erode'], ['dilate', 'dilate'], ['open', 'open'], ['close', 'close']]), radius(1), SHAPE] },
  tophat: { group: 'Morphology', label: 'Top-hat', title: 'The details smaller than the disk: bright ones (white) or dark ones (black)', params: [choice('kind', 'Kind', 'white', [['white', 'white (bright details)'], ['black', 'black (dark details)']]), radius(5), SHAPE] },
  fillholes: { group: 'Morphology', label: 'Fill holes', title: 'A mask: the holes in its objects filled', params: [] },
  skeleton: { group: 'Morphology', label: 'Skeleton', title: 'A mask: thinned to lines one pixel wide', params: [] },
  distance: { group: 'Morphology', label: 'Distance map', title: 'A mask: every object pixel its distance to the background (px)', params: [] },
  splitlines: {
    group: 'Morphology',
    label: 'Split along dark lines',
    title: 'A mask: cut where a thin dark line runs on the image under it (the gaps between touching particles, as an electron microscope shows them)',
    params: [
      num('width', 'Line width', 1, { min: 0.5, step: 0.1, unit: 'px', title: 'About as wide as the dark lines between the particles' }),
      num('depth', 'Depth', NaN, { unit: 'value', auto: '1.5 % of the range', title: 'How much darker than either side a line must be to cut' }),
      num('grow', 'Widen the cut', 0, { min: 0, step: 1, unit: 'px', title: 'The cut made wider (particles kept apart)' }),
    ],
  },
  cutedges: {
    group: 'Morphology',
    label: 'Cut along edges',
    title: 'A mask: cut inside its objects where the image under it has a strong edge (the border between touching particles, dark line or not)',
    params: [
      num('sigma', 'σ', 1, { min: 0.3, step: 0.1, unit: 'px', title: 'The image smoothed at this scale before its edges are taken' }),
      num('strength', 'Edges above', 30, { min: 1, max: 100, step: 1, unit: '%', title: 'How strong an edge must be to cut, % of the strongest' }),
      num('grow', 'Widen the cut', 0, { min: 0, step: 1, unit: 'px' }),
    ],
  },
  watershed: { group: 'Morphology', label: 'Watershed', title: 'A mask: touching round objects cut apart along the narrowings', params: [num('tolerance', 'Tolerance', 0.5, { min: 0, step: 0.1, unit: 'px', title: 'How deep a narrowing must be to cut' })] },
  // threshold
  threshold: {
    group: 'Threshold',
    label: 'Threshold',
    title: 'A mask of the objects: the values above (dark background) or below (light background) a threshold, set by hand or by a method',
    params: [
      choice('method', 'Method', 'otsu', [['manual', 'by hand'], ...GLOBAL_METHODS]),
      num('low', 'Low', NaN, { unit: 'value', auto: 'range start', title: 'By hand: the objects are the values from low to high' }),
      num('high', 'High', NaN, { unit: 'value', auto: 'range end' }),
      bool('light', 'Light background', false, 'The objects darker than the background'),
    ],
  },
  classify: {
    group: 'Threshold',
    label: 'Trainable classifier',
    title: 'A mask learnt from examples drawn on the image (as ImageJ’s Trainable Weka Segmentation): selections added to classes (object, background, edge …), a random forest on the pixels’ features at several scales; for what a threshold cannot tell apart (texture, touching particles)',
    params: [
      num('trees', 'Trees', 30, { min: 1, max: 200, step: 1, title: 'The trees of the forest: more, steadier, slower' }),
      num('smooth', 'Smoothing', 2, { min: 0, step: 0.5, unit: 'px', title: 'The classes’ probabilities smoothed before the pixel is given one (fewer stray pixels)' }),
      num('edges', 'Edges from outlines', 2, { min: 0, max: 10, step: 1, unit: 'px', title: 'A ring this wide just outside every object outlined (an area example of the target class: wand, polygon …) taught as the edge class, and the gap where two outlined objects touch; 0: none' }),
      choice('output', 'Output', 'mask', [
        ['mask', 'a mask of the target class'],
        ['split', 'objects split by edges'],
        ['probability', 'its probability (0–1)'],
        ['uncertainty', 'uncertainty (where to add examples)'],
      ]),
    ],
  },
  localthreshold: {
    group: 'Threshold',
    label: 'Local threshold',
    title: 'A threshold for every pixel from its neighbourhood (uneven lighting)',
    params: [choice('method', 'Method', 'sauvola', LOCAL_METHODS), num('size', 'Window', 15, { min: 3, step: 2, unit: 'px' }), num('k', 'k', NaN, { step: 0.05, auto: 'method default' }), num('offset', 'Offset', 0, { unit: 'value', title: 'Mean, median, Gaussian: subtracted from the local threshold' }), bool('light', 'Light background', false)],
  },
} satisfies Record<string, StepDef>;
export type StepKind = keyof typeof STEP_DEFS;
export const stepDef = (k: StepKind): StepDef => STEP_DEFS[k];

// A step of an image: its kind, on or off, its parameters (absent: the default)
export type ImgStep = { id: string; kind: StepKind; on: boolean; p: Record<string, number | string | boolean | [number, number][]> };
export const newStep = (kind: StepKind, id: string): ImgStep => ({ id, kind, on: true, p: Object.fromEntries(stepDef(kind).params.map((q) => [q.key, q.def])) });
// a parameter of a step (the default when not set)
function param<T>(s: ImgStep, key: string): T {
  const q = stepDef(s.kind).params.find((x) => x.key === key);
  const v = s.p[key];
  return (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v) && q?.type === 'num' && !Number.isNaN(q.def)) ? q?.def : v) as T;
}
// a number that may be automatic (NaN): its own, else the fallback
const or = (v: number, f: number) => (Number.isFinite(v) ? v : f);

const MASK_ONLY = new Set<StepKind>(['fillholes', 'skeleton', 'distance', 'watershed', 'splitlines', 'cutedges']);
// the steps that work on a gray image (an RGB one is made gray by its luminance first)
const GRAY_ONLY = new Set<StepKind>(['gradient', 'laplace', 'logfilter', 'dog', 'canny', 'hessian', 'localsd', 'entropy', 'range', 'gabor', 'lbp', 'threshold', 'localthreshold', 'equalize', 'clahe']);
const RGB_ONLY = new Set<StepKind>(['channel', 'grayweights', 'huesat', 'balance']);

const asGray = (r: Raster): Raster => (r.ch.length === 1 ? r : { ...r, ch: [luminance(r)], kind: 'gray' });
const gray1 = (r: Raster, c: Float32Array, lo: number, hi: number): Raster => ({ w: r.w, h: r.h, ch: [c], kind: 'gray', lo, hi });
const mask1 = (r: Raster, c: Float32Array): Raster => ({ w: r.w, h: r.h, ch: [c], kind: 'mask', lo: 0, hi: 1 });
const rangeOfData = (c: Float32Array): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < c.length; i++) {
    const v = c[i];
    if (v - v !== 0) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return Number.isFinite(lo) ? (lo === hi ? [lo, lo + 1] : [lo, hi]) : [0, 1];
};
// a robust estimate of the noise σ (Immerkær: the mean |Laplacian-like| response) for automatic strengths
export function noiseSigma(c: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let s = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      s += Math.abs(c[i - w - 1] - 2 * c[i - w] + c[i - w + 1] - 2 * c[i - 1] + 4 * c[i] - 2 * c[i + 1] + c[i + w - 1] - 2 * c[i + w] + c[i + w + 1]);
    }
  return (s * Math.sqrt(Math.PI / 2)) / (6 * (w - 2) * (h - 2));
}

// What some steps need besides the image: the examples of the trainable classifier (in pixels of the image as
// analysed, at full size); the last image that is not a mask (the one a mask was made from: its dark lines)
export type StepCtx = { train?: TrainExample[]; under?: Raster };
// the classes of a trainable classifier: its own (absent: object, background and edge — the rim just outside a particle
// and the line between touching ones), then those of its examples; only the classes with examples are learnt
export const classesOf = (s: ImgStep, train: TrainExample[] = []) => [...new Set([...String(s.p.classes ?? 'object,background,edge').split(',').map((c) => c.trim()).filter(Boolean), ...train.map((e) => e.cls)])];
// the classes of a classifier step with those of the selections given a class (its examples)
export const stepClasses = (s: ImgStep, rois: { train?: string }[]) => classesOf(s, rois.filter((r) => r.train).map((r) => ({ cls: r.train!, pts: [], line: false, width: 1 })));
// the class that makes its mask: the one chosen, else the first that is not background or an edge
export function targetClass(s: ImgStep, classes: string[]): string {
  const t = String(s.p.target ?? '');
  return classes.includes(t) ? t : (classes.find((c) => !/^(background|bg|edge|border|ground)/i.test(c)) ?? classes[0] ?? '');
}

// One step applied: the new raster and a note (the threshold found …), or why it cannot run. scale: the image is the
// original shrunk by it (a preview): the lengths in pixels shrunk too (and the frequencies per pixel grown), so the
// preview looks as the result will
export function applyStep(r: Raster, s: ImgStep, scale = 1, ctx: StepCtx = {}): { r: Raster; note?: string } | string {
  const { w, h } = r;
  const sp = r.hi - r.lo || 1;
  const defs = stepDef(s.kind).params;
  const P = <T>(k: string): T => {
    const v = param<T>(s, k);
    if (scale === 1 || typeof v !== 'number') return v;
    const q = defs.find((x) => x.key === k);
    if (q?.type !== 'num') return v;
    return (q.unit === 'px' ? v * scale : q.unit === '1/px' ? v / scale : v) as T;
  };
  if (MASK_ONLY.has(s.kind) && r.kind !== 'mask') return 'needs a mask: put a Threshold before it';
  if (RGB_ONLY.has(s.kind) && r.ch.length === 1) return 'needs a colour image';
  const g = GRAY_ONLY.has(s.kind) ? asGray(r) : r;
  const each = (f: (c: Float32Array) => Float32Array, p: Partial<Raster> = {}): { r: Raster } => ({ r: { ...g, ch: g.ch.map(f), ...p } });
  switch (s.kind) {
    case 'brightness':
      return { r: { ...r, ch: brightness(r, P<number>('amount')) } };
    case 'contrast':
      return { r: { ...r, ch: contrast(r, P<number>('factor')) } };
    case 'minmax': {
      const [dlo, dhi] = rangeOfData(r.ch.length === 1 ? r.ch[0] : luminance(r));
      return { r: { ...r, ch: minMax(r, or(P<number>('min'), dlo), or(P<number>('max'), dhi)) } };
    }
    case 'levels':
      return { r: { ...r, ch: levels(r, or(P<number>('inB'), r.lo), or(P<number>('inW'), r.hi), P<number>('gamma'), or(P<number>('outB'), r.lo), or(P<number>('outW'), r.hi)) } };
    case 'curves':
      return { r: { ...r, ch: curves(r, P<[number, number][]>('points'), r.ch.length === 3 ? [P<[number, number][]>('r'), P<[number, number][]>('g'), P<[number, number][]>('b')] : undefined) } };
    case 'autocontrast':
      return { r: { ...r, ch: autoContrast(r, P<number>('saturated')) } };
    case 'equalize':
      return { r: { ...g, ch: equalize(g) } };
    case 'clahe':
      return { r: { ...g, ch: clahe(g, P<number>('tile'), P<number>('clip'), P<number>('bins')) } };
    case 'log':
      return { r: { ...r, ch: logTone(r, P<number>('k')) } };
    case 'exp':
      return { r: { ...r, ch: logTone(r, P<number>('k'), true) } };
    case 'invert':
      return r.kind === 'mask' ? { r: { ...r, ch: r.ch.map((c) => map1(c, (v) => (v ? 0 : 1))) } } : { r: { ...r, ch: invert(r) } };
    case 'channel':
      return { r: pickChannel(r, P<ChannelPick>('which')) };
    case 'grayweights':
      return { r: weightedGray(r, P<number>('wr'), P<number>('wg'), P<number>('wb')) };
    case 'huesat':
      return { r: { ...r, ch: hueSaturation(r, P<number>('sat'), P<number>('hue')) } };
    case 'balance':
      return { r: { ...r, ch: balance(r, [P<number>('r'), P<number>('g'), P<number>('b')]) } };
    case 'gaussian':
      return each((c) => gaussian(c, w, h, P<number>('sigma')));
    case 'median':
      return each((c) => medianFilter(c, w, h, P<number>('radius'), P<Shape>('shape')));
    case 'mean':
      return each((c) => meanFilter(c, w, h, P<number>('radius'), P<Shape>('shape')));
    case 'bilateral':
      return each((c) => bilateral(c, w, h, P<number>('sigmaS'), or(P<number>('sigmaR'), 0.1 * sp)));
    case 'nlm': {
      const sigma = noiseSigma(r.ch.length === 1 ? r.ch[0] : luminance(r), w, h);
      const hh = or(P<number>('h'), Math.max(0.8 * sigma, 1e-6 * sp));
      return { ...each((c) => nonLocalMeans(c, w, h, hh, Math.max(1, Math.round(P<number>('patch'))), Math.max(1, Math.round(P<number>('search'))))), note: `h = ${+hh.toPrecision(3)} (noise σ ≈ ${+sigma.toPrecision(3)})` };
    }
    case 'anisotropic':
      return each((c) => anisotropic(c, w, h, Math.max(1, Math.round(P<number>('iterations'))), or(P<number>('kappa'), 0.05 * sp), P<number>('stepSize'), P<string>('option') === '2' ? 2 : 1));
    case 'outliers':
      return each((c) => removeOutliers(c, w, h, P<number>('radius'), or(P<number>('threshold'), 0.2 * sp), P<'bright' | 'dark' | 'both'>('which')));
    case 'bandpass':
      return each((c) => bandpass(c, w, h, P<number>('large'), P<number>('small'), P<'none' | 'h' | 'v'>('stripes'), P<number>('tol')));
    case 'fftmask': {
      // (spots in cycles per pixel of the original; a preview shrunk by scale: more cycles per pixel)
      const spots = (P<[number, number][] | undefined>('spots') ?? []).map(([fx, fy]): [number, number] => [fx / scale, fy / scale]);
      if (!spots.length) return 'pick the spots in the Lattice tab first';
      return each((c) => spotMask(c, w, h, spots, 1 / Math.max(2, P<number>('area')), P<string>('mode') === 'keep'));
    }
    case 'scanlines':
      return each((c) => scanLines(c, w, h, P<'rows' | 'cols'>('along'), P<'median' | 'mean'>('how')));
    case 'rollingball':
    case 'paraboloid': {
      const light = P<boolean>('light');
      const out = P<string>('output');
      const rad = P<number>('radius');
      return each((c) => {
        const u = light ? map1(c, (v) => r.lo + r.hi - v) : c;
        const bg = s.kind === 'rollingball' ? rollingBall(u, w, h, rad) : slidingParaboloid(u, w, h, rad);
        if (out === 'background') return light ? map1(bg, (v) => r.lo + r.hi - v) : bg;
        const d = map1(u, (v, i) => v - bg[i] + r.lo);
        return light ? map1(d, (v) => r.lo + r.hi - v) : d;
      });
    }
    case 'level': {
      const out = g.ch.map((c) => levelSurface(c, w, h, Number(P<string>('order')) || 1, P<number>('exclude'), P<'mean' | 'min' | 'keep'>('zero')));
      let [lo, hi] = [Infinity, -Infinity];
      for (const c of out)
        for (let i = 0; i < c.length; i++) {
          const v = c[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      return { r: { ...g, ch: out, kind: g.kind === 'mask' ? 'gray' : g.kind, lo: Number.isFinite(lo) ? lo : 0, hi: hi > lo ? hi : lo + 1 } };
    }
    case 'subgauss':
      return each((c) => {
        const b = gaussianWide(c, w, h, P<number>('sigma'));
        let m = 0;
        for (let i_ = 0; i_ < b.length; i_++) {
          const v = b[i_];
          m += v;
        }
        m /= b.length;
        return map1(c, (v, i) => v - b[i] + m);
      });
    case 'flatfield':
      return each((c) => {
        const b = gaussianWide(c, w, h, P<number>('sigma'));
        let m = 0;
        for (let i_ = 0; i_ < b.length; i_++) {
          const v = b[i_];
          m += v;
        }
        m /= b.length;
        return map1(c, (v, i) => (b[i] ? (v * m) / b[i] : v));
      });
    case 'unsharp':
      return each((c) => {
        const b = gaussian(c, w, h, P<number>('sigma'));
        const a = P<number>('amount');
        return map1(c, (v, i) => v + a * (v - b[i]));
      });
    case 'gradient': {
      const c = gradient(g.ch[0], w, h, P<'sobel' | 'prewitt' | 'scharr'>('op'), P<'magnitude' | 'x' | 'y'>('part'));
      return { r: gray1(r, c, ...rangeOfData(c)) };
    }
    case 'laplace': {
      const c = laplace(g.ch[0], w, h);
      return { r: gray1(r, c, ...rangeOfData(c)) };
    }
    case 'logfilter': {
      const sig = P<number>('sigma');
      // scale-normalised (σ²), bright spots positive when asked
      const c = laplacianOfGaussian(g.ch[0], w, h, sig).map((v) => (P<boolean>('negate') ? -1 : 1) * sig * sig * v);
      return { r: gray1(r, c, ...rangeOfData(c)) };
    }
    case 'dog': {
      const a = gaussian(g.ch[0], w, h, P<number>('s1'));
      const b = gaussian(g.ch[0], w, h, P<number>('s2'));
      const c = map1(a, (v, i) => v - b[i]);
      return { r: gray1(r, c, ...rangeOfData(c)) };
    }
    case 'canny':
      return { r: mask1(r, canny(g.ch[0], w, h, P<number>('sigma'), P<number>('low') * sp, P<number>('high') * sp)) };
    case 'ridges': {
      const [a, b] = [Math.max(0.3, P<number>('smin')), Math.max(0.3, P<number>('smax'))];
      const [lo, hi] = [Math.min(a, b) * scale, Math.max(a, b) * scale];
      // (three scales or so between the two widths)
      const sig = hi - lo < 0.2 ? [lo] : [lo, (lo + hi) / 2, hi];
      return { r: gray1(r, frangi(g.ch[0], w, h, sig.map((x) => Math.max(0.3, x)), P<string>('kind') !== 'bright'), 0, 1) };
    }
    case 'edgesub': {
      const sm = gaussian(g.ch[0], w, h, Math.max(0.3, P<number>('sigma') * scale));
      const gm = gradient(sm, w, h, 'sobel', 'magnitude');
      const top = rangeOfData(gm)[1] || 1;
      const k = P<number>('k') * ((g.hi - g.lo) || 1);
      return { r: gray1(r, map1(g.ch[0], (v, i) => v - (k * gm[i]) / top), g.lo - k, g.hi) };
    }
    case 'hessian': {
      const which = P<'larger' | 'smaller'>('which');
      const e = hessianEigen(g.ch[0], w, h, P<number>('sigma'), which);
      // bright ridges: the smaller eigenvalue is strongly negative across them; shown positive
      const c = map1(e, (v) => (which === 'smaller' ? Math.max(0, -v) : Math.max(0, v)));
      return { r: gray1(r, c, ...rangeOfData(c)) };
    }
    case 'localsd': {
      const c = varianceFilter(g.ch[0], w, h, P<number>('radius'), P<Shape>('shape'), !P<boolean>('variance'));
      return { r: gray1(r, c, ...rangeOfData(c)) };
    }
    case 'entropy': {
      const integer = g.ch[0].every((v) => v === Math.round(v)) && g.hi - g.lo < 256;
      const c = entropyFilter(g.ch[0], w, h, P<number>('radius'), g.lo, integer ? g.lo + 256 : g.hi, 256);
      return { r: gray1(r, c, 0, 8) };
    }
    case 'range': {
      const mx = minMaxFilter(g.ch[0], w, h, P<number>('radius'), true, P<Shape>('shape'));
      const mn = minMaxFilter(g.ch[0], w, h, P<number>('radius'), false, P<Shape>('shape'));
      const c = map1(mx, (v, i) => v - mn[i]);
      return { r: gray1(r, c, 0, sp) };
    }
    case 'gabor': {
      const c = gabor(g.ch[0], w, h, P<number>('frequency'), (P<number>('theta') * Math.PI) / 180, P<number>('bandwidth'));
      return { r: gray1(r, c, ...rangeOfData(c)) };
    }
    case 'lbp': {
      const pts = Math.max(4, Math.round(P<number>('points')));
      return { r: gray1(r, lbp(g.ch[0], w, h, pts, P<number>('radius')), 0, pts + 1) };
    }
    case 'morph': {
      const op = P<string>('op');
      const f = op === 'erode' ? erode : op === 'dilate' ? dilate : op === 'open' ? opening : closing;
      return { r: { ...r, ch: r.ch.map((c) => f(c, w, h, P<number>('radius'), P<Shape>('shape'))) } };
    }
    case 'tophat':
      return { r: { ...r, ch: r.ch.map((c) => topHat(c, w, h, P<number>('radius'), P<string>('kind') === 'black', P<Shape>('shape'))) } };
    case 'fillholes':
      return { r: mask1(r, fillHoles(r.ch[0], w, h)) };
    case 'skeleton':
      return { r: mask1(r, skeleton(r.ch[0], w, h)) };
    case 'distance': {
      const c = distanceMap(r.ch[0], w, h);
      return { r: gray1(r, c, 0, Math.max(1, rangeOfData(c)[1])) };
    }
    case 'splitlines': {
      const u = ctx.under && ctx.under.w === w && ctx.under.h === h ? ctx.under : null;
      if (!u) return 'needs the image the mask was made from';
      const ug = u.ch.length === 1 ? u.ch[0] : luminance(u);
      // (a dark line: across it the image curves up — the Hessian's larger eigenvalue — by more than the depth)
      const v = hessianEigen(ug, w, h, Math.max(0.5, P<number>('width')), 'larger');
      const depth = or(P<number>('depth'), 0.015 * (u.hi - u.lo || 1));
      let cut = map1(v, (x) => (x > depth ? 1 : 0));
      const grow = Math.round(P<number>('grow'));
      if (grow > 0) cut = dilate(cut, w, h, grow);
      let n = 0;
      const m = map1(r.ch[0], (x, i) => (x > 0.5 && !cut[i] ? 1 : 0));
      for (let i = 0; i < m.length; i++) if (r.ch[0][i] > 0.5 && cut[i]) n++;
      return { r: mask1(r, m), note: `${n} px cut (depth ${+depth.toPrecision(3)})` };
    }
    case 'cutedges': {
      const u = ctx.under && ctx.under.w === w && ctx.under.h === h ? ctx.under : null;
      if (!u) return 'needs the image the mask was made from';
      const ug = gaussian(u.ch.length === 1 ? u.ch[0] : luminance(u), w, h, Math.max(0.3, P<number>('sigma') * scale));
      const gm = gradient(ug, w, h, 'sobel', 'magnitude');
      const thr = (P<number>('strength') / 100) * (rangeOfData(gm)[1] || 1);
      const m0 = r.ch[0];
      // (only inside the objects: a pixel whose 8 neighbours are all in the mask — their outer edge is not cut)
      const inside = (i: number) => {
        const [x, y] = [i % w, (i / w) | 0];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!(m0[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))] > 0.5)) return false;
        return true;
      };
      let cut = map1(m0, (v, i) => (v > 0.5 && gm[i] > thr && inside(i) ? 1 : 0));
      const grow = Math.round(P<number>('grow'));
      if (grow > 0) cut = dilate(cut, w, h, grow);
      let n = 0;
      const m = map1(m0, (v, i) => (v > 0.5 && !cut[i] ? 1 : 0));
      for (let i = 0; i < m.length; i++) if (m0[i] > 0.5 && cut[i]) n++;
      return { r: mask1(r, m), note: `${n} px cut` };
    }
    case 'watershed':
      return { r: mask1(r, separate(r.ch[0], w, h, P<number>('tolerance'))) };
    case 'threshold': {
      const c = g.ch[0];
      const method = P<string>('method');
      const light = P<boolean>('light');
      if (method === 'manual') {
        const lo = or(P<number>('low'), g.lo);
        const hi = or(P<number>('high'), g.hi);
        return { r: mask1(r, map1(c, (v) => (v >= lo && v <= hi ? 1 : 0))), note: `${+lo.toPrecision(5)} … ${+hi.toPrecision(5)}` };
      }
      const t = globalThreshold(c, method as GlobalMethod);
      if (typeof t === 'string') return t;
      const name = GLOBAL_METHODS.find(([k]) => k === method)?.[1] ?? method;
      return { r: mask1(r, map1(c, (v) => ((light ? v <= t : v > t) ? 1 : 0))), note: `${name}: ${+t.toPrecision(5)}` };
    }
    case 'classify': {
      const ex = (ctx.train ?? []).map((e) => ({ ...e, pts: e.pts.map(([x, y]): [number, number] => [x * scale, y * scale]), width: Math.max(1, e.width * scale) }));
      // (edges from the outlines: absent in a step of an older project, none)
      const named = classesOf(s, ex);
      const target = targetClass(s, named);
      const edgeCls = edgeClassOf(named);
      const ring = Number(s.p.edges ?? 0) * scale;
      const res = classifyPixels(r, ex, { trees: P<number>('trees'), scale, ...(ring > 0 ? { auto: { from: target, to: edgeCls, ring } } : {}) });
      if (!res) return 'needs examples of two classes: paint on the image with a class chosen (or add selections to the classes)';
      const k = Math.max(0, res.classes.indexOf(target));
      const sm = P<number>('smooth');
      const prob = sm > 0 ? res.prob.map((c) => gaussian(c, w, h, sm)) : res.prob;
      const out = P<string>('output');
      let note = `${res.classes.map((c, j) => `${c}: ${res.samples[j]} px`).join(', ')} → ${res.classes[k]}`;
      if (out === 'probability') return { r: gray1(r, prob[k], 0, 1), note };
      if (out === 'uncertainty') return { r: gray1(r, uncertainty(prob), 0, 1), note: `${note}; bright: where it hesitates` };
      if (out === 'split') {
        // (the edge's share as voted: smoothed, a gap of a pixel or two between objects would fade)
        const e = res.classes.indexOf(edgeCls);
        const sp = splitByEdges(prob.map((c, j) => (j === e ? res.prob[j] : c)), k, e, w, h);
        note += `; ${sp.objects} object${sp.objects === 1 ? '' : 's'}${res.classes.includes(edgeCls) ? '' : ' (no edge class: not split)'}`;
        return { r: mask1(r, sp.mask), note };
      }
      // (the pixels where the target class has more votes than any other)
      const m = new Float32Array(w * h);
      for (let i = 0; i < m.length; i++) {
        let best = 0;
        for (let c = 1; c < prob.length; c++) if (prob[c][i] > prob[best][i]) best = c;
        m[i] = best === k ? 1 : 0;
      }
      return { r: mask1(r, m), note };
    }
    case 'localthreshold': {
      const light = P<boolean>('light');
      const c = light ? map1(g.ch[0], (v) => g.lo + g.hi - v) : g.ch[0];
      const k = P<number>('k');
      const m = localThreshold(c, w, h, P<string>('method') as LocalMethod, Math.round(P<number>('size')), { offset: P<number>('offset'), ...(Number.isFinite(k) ? { k } : {}), lo: g.lo, hi: g.hi });
      return { r: mask1(r, m) };
    }
  }
}

// The steps in their order (those switched off passed over): the raster at the end, and for every step its note or
// what went wrong
// seen: the raster that comes into each step (its place in the list), before it runs
export function applySteps(base: Raster, steps: ImgStep[], upTo = steps.length, seen?: (k: number, r: Raster) => void, scale = 1, ctx: StepCtx = {}): { r: Raster; notes: Record<string, string>; errors: Record<string, string> } {
  let r = base;
  // (the last image that is not a mask)
  let under = base;
  const notes: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const [k, s] of steps.slice(0, upTo).entries()) {
    seen?.(k, r);
    if (!s.on || !(s.kind in STEP_DEFS)) continue;
    const out = applyStep(r, s, scale, { ...ctx, under });
    if (typeof out === 'string') {
      errors[s.id] = out;
      continue;
    }
    r = out.r;
    if (r.kind !== 'mask') under = r;
    if (out.note) notes[s.id] = out.note;
  }
  return { r, notes, errors };
}
