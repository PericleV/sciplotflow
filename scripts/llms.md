# SciPlotFlow

> Node-based data analysis and publication-quality figures in the browser (like Origin, built from nodes). Nothing is
> installed and the user's data never leave their computer. This file is for language models: it says how to build a
> project for the user, which the user opens with Open project.

## What you give the user

A project file (JSON), which the user opens in the app with Open project (or drops on the canvas). Give it as a file
or as a JSON code block the user saves as `name.json`. Do not give links that open projects.

Files to read (next to this one):

- `api/nodes.json`: every node: its type, what it does (`help`), its input and output ports with the types they take
  or give, its options (`options`: type and meaning) and its `defaults`; `types`: the fields of the named types the
  options use (`CurveRow`, `AxesStyle`, `ModelSpec` …); `lists`: the names some options take (the fit models of the
  library with their formulas and parameters, the peak shapes).
- `api/project.schema.json`: the JSON schema of the project file.
- `api/recipes.json`: the examples of the app: the task, its chain of nodes and connections, and for the small ones the
  whole project file. Start from the recipe closest to the task.
- `api/check.mjs`: the checker (below).

## Rules (internal, for you)

Before you give the project to the user, check it and repair it:

1. Run the checker when you can run code: `node check.mjs project.json` (Node 20 or later; the file has no
   dependencies). It reads the project as the app does, tries every connection by the app's rule, runs every node with
   the app's own engine and prints, for every node, its errors, its warnings and what each output holds (for a
   dataset: its rows and the names of its columns).
2. Repair every error and run it again, until it prints `OK`. Read the warnings too: a warning often means a column was
   not found or an option does not fit the data.
3. Check the outputs it prints against the task: the right columns, the right number of rows, the values expected.
4. If you could not run the checker, go through the checklist below by hand, and tell the user plainly that the project
   was not checked by running it. Never say a project was checked or tested when it was not.
5. Use only node types, ports and options that are in `api/nodes.json`. Do not invent them. When an option is not in
   `defaults` or `options`, leave it out.
6. Python nodes run only in the browser: the checker does not run them. Keep their code short and correct, and say so.

Checklist (without the checker):

- `"app": "graph-flow"` and `"version": {{VERSION}}`.
- Every node: a unique `id`, a `type` from nodes.json, a `position` {x, y}, `data` = its `defaults` from nodes.json
  with only the needed fields changed.
- Every edge: a unique `id`, `source` and `target` = ids of nodes, `sourceHandle` = an output id of the source node,
  `targetHandle` = an input id of the target node, and the output's type among the types the input takes.
- An input not marked multiple takes one connection only (a Plot's `dataset` and `insets`, a Merge's `figures` take
  several).
- Every column a node names (in its options) exists in the data it receives, written exactly, with its unit.
- Numbers that are not finite are written `{"$num": "NaN"}` (or `"Infinity"`, `"-Infinity"`), as in `defaults`.

## How a graph works

- Data nodes (Import, Workbook) give tables; analysis nodes (Fit, Peak analyzer, ANOVA, Smooth …) take them and give
  tables, columns or values; graph nodes (1D plot, Histogram, Box & violin …) make figures; a Merge (`canvas`) puts
  several figures on one page.
- A table (dataset) is a list of columns. A column has one header, its name with its unit in it:
  `Wavelength (nm)`. Columns have designations (X, Y, ±Y, ±X, label, none) that analysis and plot nodes use when no
  column is chosen.
- The data a user gives you go into an Import node: `data.text` = the file's text (CSV, TSV or spaces), `data.fileName`
  = a name with its extension, `data.textId` = any short unique string; `data.csv` tells how to read it (start from its
  defaults: the separator and the line of names are detected). Or into a Workbook (`book`): `data.sheets[k].text` =
  a tab-separated table, a first line of names. When the data are large or private, leave Import empty
  (`text: ""`) and tell the user to load their file into it: the rest of the graph runs then.
- Only a 1D plot (`plot1d`) gives a curve its look (colour, line, symbols); data nodes carry no style. A 1D plot is a
  whole figure: page, axes, legend, annotations. Its curves come from its `dataset` input (every Y with its X), or from
  the columns on its row ports (`x`, `y`, then `x-1`, `y-1` … for more curves).
- The first curve of a 1D plot is in its data itself (`label`, `style`, `cols`); curves 2, 3 … are `rows[0]`,
  `rows[1]` … (`types.CurveRow`). Give every curve its colour (`style.color`, from `lists.curveColors`, the second one
  first: the first is black) and its `style.mode` (`types.PlotMode`); a style lists only what it changes.
- A curve of a 1D plot takes its columns by name (`cols: {x, y}`) from the datasets on the plot's `dataset` port.
  When two of them share a column name (the data and a Fit's curve both have the X column), give the curve its own
  dataset on its row's port instead: `series` (curve 1), `series-1` (curve 2, `rows[0]`) …. A Fit's `fit` output is
  named `fit of <Y>`; the checker prints the columns of every output, so read them there rather than guess.
- Port ids with `<k>` are numbered: `in-0`, `in-1` …; `y`, `y-1`, `y-2` … (`pattern: true` in nodes.json).
- Place the nodes left to right in the order of the data (about 400 px between columns, 250 px between rows).

## Port types

{{PORT_TYPES}}

## Nodes

{{NODES}}
