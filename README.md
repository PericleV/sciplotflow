# SciPlotFlow

**Version 1.1** · [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23658458.svg)](https://doi.org/10.5281/zenodo.23658458)

SciPlotFlow is a free app for scientific data analysis and publication-quality graphs, built from nodes. You import a
file, clean it, compute, fit and test, then draw the figure. Every step is a node on a canvas, so the whole analysis
stays visible, and changing anything updates everything after it. It runs in your browser, and your data never leaves
your computer.

## Version 1.0

SciPlotFlow 1.0 is the first complete version: data, statistics, signals, fitting, image analysis and figures for
publication, each computation checked against established libraries ([VALIDATION.md](VALIDATION.md)).

- Projects saved now will keep opening in later versions.
- Save your projects often (**Save** at the top, or **Projects** to keep them in the browser).
- If something goes wrong, please tell me (see [Reporting a problem](#reporting-a-problem)).

## Try it

**Online:** [periclev.github.io/sciplotflow](https://periclev.github.io/sciplotflow/). Nothing to install. New to it? Start the tutorial in the Welcome window: a few minutes, step by step, with **Show me** when you are stuck.

**On your computer:** you need [Node.js](https://nodejs.org) 22.18 or newer (24 recommended).

```bash
npm install
npm run dev
```

Then open the address it prints (usually `http://localhost:5173`).

To build the static site: `npm run build` (the result goes to `dist/` and works from any folder or web host).

## What it can do

**Data**
- Import CSV, TXT, DAT, Excel (.xlsx, .xls) and OpenDocument (.ods) files, a single file or a whole folder.
- Workbooks with several sheets, extract and split columns, combine tables, reshape and transpose.
- Compute new columns with formulas, generate columns, filter and sort rows, clean data (missing values, duplicates,
  outliers).
- Digitize the data of a graph from a picture, or the phases of a phase diagram.

**Statistics**
- Descriptive statistics, normality tests and outliers; p-values adjusted for multiple tests.
- t-tests, ANOVA (post-hoc tests, Dunnett, repeated measures, mixed models), nonparametric tests, correlation.
- Linear and logistic regression, contingency tables (χ², Fisher, odds ratio, McNemar), ROC curves, survival
  (Kaplan–Meier, log-rank).
- Power and sample size, bootstrap and permutation tests, distributions fitted by maximum likelihood.
- Agreement and reliability (Cohen's and Fleiss' κ, ICC, Cronbach's α), method comparison (Passing–Bablok, Deming,
  Bland–Altman), life data (Weibull with suspensions).

**Signals**
- Smooth (Savitzky–Golay, LOWESS, wavelet, Hampel and more), interpolate, normalize, average curves.
- FFT: spectrum, power spectral density, spectrogram, coherence, envelope and phase, Allan deviation, Lomb–Scargle
  for unevenly sampled data, harmonics (THD, SNR, SINAD, ENOB); filters (Butterworth, Chebyshev, Bessel, a mains notch).
- Baseline correction (asymmetric least squares, arPLS, SNIP, Shirley, points drawn by hand and more), waveform
  measurements (rise and fall times, period, duty cycle, overshoot), step detection, event averaging.
- Wavelets: the continuous transform with its significance, coherence, multiresolution analysis, denoising, peaks.
- Fractional calculus (semi-integrals for convolution voltammetry) and the fractional Fourier transform.
- Convolution and deconvolution; every one of these on the whole curve or on ranges drawn on its graph.

**Analysis**
- Fit with built-in models, your own formula or several peaks; peak analysis and peak widths.
- Differentiate and integrate, curve math, matrix computations, Kramers–Kronig.
- Electrochemistry: equivalent circuits fitted to impedance spectra, the Kramers–Kronig test.
- Image analysis: adjust and filter images, calibrate with the scale bar, measure selections, find and classify
  particles, distances between them, FFT and lattice spacings (TEM), surface roughness (AFM).
- Python scripts (numpy, scipy, pandas and more), run in the browser.
- **Batch:** the same analysis run on every file of a folder, with the results gathered in one table.

**Checked against established libraries:** every computation is tested against SciPy, statsmodels, scikit-learn,
scikit-image, PyWavelets and others; see [VALIDATION.md](VALIDATION.md).

**Graphs and figures**
- Line and scatter plots, histograms, bar charts, box and violin plots, probability plots, Bland–Altman, pie charts,
  contour and heat maps, polar and radar, scatter matrix, ternary, waterfall and 3D plots.
- A whole figure in one node: axes, legend, annotations and page, with sizes in mm, cm or inches and text in points.
- LaTeX formulas in any text of a figure (`$\Delta E = h\nu$`), drawn by MathJax.
- **Merge** several plots into one figure with panels (a), (b), (c).
- **Figure Drawing:** draw over a figure or on an empty page (shapes, arrows, paths, text).
- Export to SVG, PNG, TIFF and PDF at the exact physical size.

**Notes and working together**
- Notes on the canvas: a small word processor with live figures, pictures, tables and formulas, exported to Word,
  PDF, HTML or Markdown.
- Frames, groups and reroute points to keep large analyses tidy; groups can be saved and reused.
- Share a project as a link, or work on it together with someone else, connected directly browser to browser.
- Light and dark theme, with your own accent and selection colours.

## Your data stays with you

Everything runs in your browser. Your files and projects are not sent anywhere. The only download after the app itself
is Python (Pyodide), fetched from a public CDN the first time you run a Python script.

## Are the results right?

Every computation is checked by `npm run check` (more than 1400 checks). Where an established library does the same thing
(SciPy, statsmodels, pingouin, lifelines, scikit-learn, scikit-image, PyWavelets, pycwt, astropy and others), the result
is compared with its values. [VALIDATION.md](VALIDATION.md) lists every check, what it compares and how close the result
is, with the Python scripts that compute the reference values.

## Browsers

A recent version of Chrome, Edge or Firefox. Safari should work but has been tested less.

## Known limitations

- Very large files (millions of rows) can make the app slow.
- Working together needs both browsers to reach each other directly; some company or university networks block this.
- Machine learning nodes are planned for a later version.

## Reporting a problem

Please open an [issue](https://github.com/PericleV/sciplotflow/issues) and write:

1. what you did, step by step;
2. what you expected and what happened instead;
3. your browser and system;
4. if you can, the project file (**Save**) or a small piece of the data.

Ideas and requests are welcome too.

## Citing SciPlotFlow

If SciPlotFlow helped your work, please cite it (also under **Cite** at the top of the app, as APA or BibTeX):

> Vărășteanu, P. (2026). SciPlotFlow (Version 1.1) [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.23658458

This DOI stands for all the versions (it leads to the latest); every version also has its own on
[Zenodo](https://doi.org/10.5281/zenodo.23658458). GitHub's **Cite this repository** gives the same, from
[CITATION.cff](CITATION.cff).

## License

SciPlotFlow is released under the [MIT License](LICENSE). It is built on open-source software; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the list and their licences.

## About the author

SciPlotFlow is written by Pericle Vărășteanu, IMT Bucharest. If you find it useful, you can support my photography by
following me on Instagram: [@pericle_v](https://www.instagram.com/pericle_v/).
