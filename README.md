# SciPlotFlow

**Version 0.1.0-alpha, public test**

SciPlotFlow is a free app for scientific data analysis and publication-quality graphs, built from nodes. You import a
file, clean it, compute, fit and test, then draw the figure. Every step is a node on a canvas, so the whole analysis
stays visible, and changing anything updates everything after it. It runs in your browser, and your data never leaves
your computer.

## This is an alpha version

This first public version is here to be tried and tested. Please keep in mind:

- Things can still change, and some parts may not work as expected.
- Save your projects often (**Save** at the top, or **Projects** to keep them in the browser).
- Projects saved now will keep opening in later versions.
- If something goes wrong, please tell me (see [Reporting a problem](#reporting-a-problem)).

## Try it

**Online:** [periclev.github.io/sciplotflow](https://periclev.github.io/sciplotflow/). Nothing to install.

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
- Digitize the data of a graph from a picture.

**Statistics**
- Descriptive statistics, normality tests and outliers.
- t-tests, ANOVA (with post-hoc tests), nonparametric tests, correlation.

**Signals and analysis**
- Smooth, interpolate, normalize, FFT, convolution, average curves.
- Fit with built-in models, your own formula or several peaks; peak analysis and peak widths.
- Differentiate and integrate, curve math, matrix computations.
- Python scripts (numpy, scipy, pandas and more), run in the browser.
- A report that gathers the results of the analysis.
- **Batch:** the same analysis run on every file of a folder, with the results gathered in one table.

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

## License

SciPlotFlow is released under the [MIT License](LICENSE). It is built on open-source software; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the list and their licences.

## About the author

SciPlotFlow is written by Pericle Vărășteanu, IMT Bucharest. If you find it useful, you can support my photography by
following me on Instagram: [@pericle_v](https://www.instagram.com/pericle_v/).
