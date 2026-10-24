// The scenes filmed for the README (record.ts). Each is page code run with `rec` (window.__rec, RecordLayer.tsx):
// setup (before filming: an example opened, a node selected and brought into view), box (the part of the page the
// GIF shows: the node, the nodes shown with it and the Options panel; none: all of it), act (what is filmed:
// rec.play moves the drawn pointer as Show me does). file: where the GIF goes in docs/media (none: its name).
// Times in ms.
export type Scene = { name: string; file?: string; setup: string; act: string; box?: string; settle?: number; lead?: number; hold?: number };

// ---- a node's scene: its example, the node selected, in view with room for its options; `show`: other nodes (by
// type, the first of each) filmed with it, to see what its change does to them ----
// view: the nodes framed instead of the node itself (the one whose change shows, as a Plot), its options beside them
type Opts = { show?: string[]; view?: string[]; pick?: number; hold?: number; full?: boolean };
const q = (v: unknown) => JSON.stringify(v);
// helpers every act may use: put (a value into an option, its patch applied), click (a button of the node), tab,
// look (the pointer rests on a part of the node), pause
const PRELUDE = `
  const put = (label, value, patch, text) => ({ kind: 'set', at: rec.kit.field(label), value: String(value), text, apply: { id, f: (d) => ({ ...d, ...patch }) } });
  const putWith = (label, value, f, text) => ({ kind: 'set', at: rec.kit.field(label), value: String(value), text, apply: { id, f } });
  const click = (re) => ({ kind: 'click', at: (d) => rec.kit.buttonIn(rec.kit.nodeEl(d, id), re) });
  const tab = (t) => ({ kind: 'click', at: rec.kit.optionButton(t) });
  const look = (sel, ms = 900) => ({ kind: 'point', at: (d) => (sel ? rec.kit.nodeEl(d, id)?.querySelector(sel) : rec.kit.nodeEl(d, id)), ms });
  const lookAt = (sel, ms = 900) => ({ kind: 'point', at: (d) => d.querySelector(sel), ms });
  const pause = (ms) => rec.wait(ms);`;
function node(type: string, example: string, act: string, o: Opts = {}): Scene {
  // the nodes framed (by their ids, found in the page): the node and those shown with it, or the view alone
  const framed = o.view ? `${q(o.view)}.map((t) => rec.ids(t)[0]).filter(Boolean)` : `[id, ...${q(o.show ?? [])}.map((t) => rec.ids(t)[0]).filter(Boolean)]`;
  return {
    name: type,
    file: `nodes/${type}`,
    setup: `
      await rec.example(${q(example)});
      await rec.wait(1800);
      await rec.panels(false);
      const id = rec.ids(${q(type)})[${o.pick ?? 0}];
      rec.api.select(id);
      await rec.wait(700);
      await rec.panels(undefined, true);
      const framed = ${framed};
      if (framed.length > 1) await rec.focus(framed, 420);
      else await rec.focusTop(framed[0], 420);
      await rec.wait(500);`,
    box: o.full ? undefined : `const id = rec.ids(${q(type)})[${o.pick ?? 0}]; return rec.box(${framed});`,
    act: `const id = rec.ids(${q(type)})[${o.pick ?? 0}]; ${PRELUDE} ${act}`,
    hold: o.hold,
  };
}

export const SCENES: Scene[] = [
  // ---- the first look ----
  {
    name: 'hero',
    file: 'hero',
    setup: `rec.blank(); await rec.wait(400); await rec.panels(false, false);`,
    act: `
      rec.api.importText('uv-vis.csv', rec.uvVis);
      await rec.wait(900);
      const id = rec.ids('import')[0];
      await rec.panels(undefined, false);
      await rec.focus([id]);
      await rec.wait(500);
      await rec.play([
        { kind: 'click', at: (d) => rec.kit.buttonIn(rec.kit.nodeEl(d, id), /^Plot…$/) },
        { kind: 'click', at: (d) => rec.kit.buttonIn(d.querySelector('.plot-dialog'), /^Make the figure/) },
      ]);
      await rec.wait(700);
      await rec.panels(undefined, false);
      await rec.focus(rec.ids('import').concat(rec.ids('plot1d')));
      await rec.wait(500);
      await rec.play([{ kind: 'add', palette: 'Smooth', spec: { type: 'smooth', data: rec.defaults.smooth, from: [{ id, to: 'in' }] } }]);
      await rec.wait(900);
      await rec.panels(undefined, false);
      await rec.focus(rec.api.nodes().map((n) => n.id));
      await rec.wait(800);`,
    hold: 2500,
  },
  {
    name: 'import',
    file: 'nodes/import',
    setup: `rec.blank(); await rec.wait(400); await rec.panels(false, false);`,
    act: `
      rec.api.importText('uv-vis.csv', rec.uvVis);
      await rec.wait(900);
      const id = rec.ids('import')[0];
      await rec.panels(undefined, false);
      await rec.focus([id]);
      await rec.wait(600);
      await rec.play([
        { kind: 'point', at: (d) => rec.kit.nodeEl(d, id)?.querySelector('table, .sheet-scroll'), ms: 900 },
        { kind: 'click', at: (d) => rec.kit.buttonIn(rec.kit.nodeEl(d, id), /^Plot…$/) },
        { kind: 'click', at: (d) => rec.kit.buttonIn(d.querySelector('.plot-dialog'), /^Make the figure/) },
      ]);
      await rec.wait(900);
      await rec.panels(undefined, false);
      await rec.focus(rec.ids('import').concat(rec.ids('plot1d')));`,
  },
  {
    name: 'theme',
    file: 'theme',
    setup: `await rec.example('Publication figure'); await rec.wait(1800);`,
    act: `
      const theme = (d) => d.querySelector('.tb-theme');
      await rec.play([{ kind: 'point', at: theme, ms: 300 }]);
      rec.setTheme('dark');
      await rec.wait(1400);
      const plot = rec.ids('plot1d')[0];
      await rec.play([
        { kind: 'select', id: plot },
        { kind: 'click', at: (d) => d.querySelector('button[title^="Selection colour"]') },
        { kind: 'click', at: (d) => d.querySelector('.color-grid button[title="Blue"]') },
        { kind: 'click', at: (d) => d.querySelector('button[title^="Accent colour"]') },
        { kind: 'click', at: (d) => d.querySelector('.color-grid button[title="Orange"]') },
      ]);
      await rec.wait(1000);
      await rec.play([{ kind: 'point', at: theme, ms: 300 }]);
      rec.setTheme('light');
      await rec.wait(1200);
      await rec.play([
        { kind: 'click', at: (d) => d.querySelector('button[title^="Accent colour"]') },
        { kind: 'click', at: (d) => d.querySelector('.color-menu > button') },
        { kind: 'click', at: (d) => d.querySelector('button[title^="Selection colour"]') },
        { kind: 'click', at: (d) => d.querySelector('.color-grid button[title="Teal"]') },
      ]);`,
  },

  // ---- Data ----
  node('book', 'Cleaning a sensor log', `
    await rec.play([look('.sheet-scroll, table', 1200), click(/^Plot…$/), { kind: 'click', at: (d) => rec.kit.buttonIn(d.querySelector('.plot-dialog'), /^Make the figure/) }]);
    await pause(900);`),
  node('extract', 'Four runs in a workbook', `
    await rec.play([put('Sheet', 'Run 1', { sheet: 'Run 1' })]); await pause(900);
    await rec.play([put('Sheet', 'Run 4', { sheet: 'Run 4' })]);`, { show: ['stats'] }),
  node('autoextract', 'Four runs in a workbook', `
    await rec.play([put('Names', 'sheet-column', { names: 'sheet-column' })]); await pause(1200);
    await rec.play([put('Names', 'sheet', { names: 'sheet' })]);`, { view: ['plot1d'] }),
  node('datamanip', 'Cleaning a sensor log', `
    await rec.play([look('svg', 700), click(/^Select$/),
      { kind: 'set', at: (d) => rec.kit.nodeEl(d, id)?.querySelector('svg'), text: 'a box over the points to mask', apply: { id, f: (d) => ({ ...d, ops: [...d.ops, { kind: 'mask', rows: '80-84', n: d.ops[0]?.n ?? 121 }] }) } }]);`),
  node('mathcol', 'Generated data', `
    const formula = (f) => ({ kind: 'set', at: (d) => d.querySelector('.inspector.overlay .formula-row textarea, .inspector.overlay .formula-row input'), text: f, apply: { id, f: (d) => ({ ...d, formula: f }) } });
    await rec.play([formula('exp(-A/6)*cos(2*pi*A/1.6)')]); await pause(1000);
    await rec.play([formula('exp(-A/3)*cos(2*pi*A/0.8)')]);`, { view: ['plot1d'] }),
  node('gencol', 'Generated data', `
    await rec.play([put('Rows', '40', { count: 40 })]); await pause(1000);
    await rec.play([put('Rows', '301', { count: 301 })]);`, { view: ['plot1d'] }),
  node('columns', 'Cleaning a sensor log', `
    await rec.play([{ kind: 'click', soft: true, at: (d) => (d.querySelector('.inspector.overlay details.sub')?.open ? null : d.querySelector('.inspector.overlay details.sub > summary')) },
      put('Add before / after', 'raw ', { prefix: 'raw ' })]);
    await pause(900);`),
  node('unstack', 'Gold n, k', `
    await rec.play([lookAt('.inspector.overlay svg', 1200), put('X out', 'each', { xs: 'each' })]); await pause(900);
    await rec.play([put('X out', 'first', { xs: 'first' })]);`, { view: ['plot1d'] }),
  node('combine', 'Replicate scans', `
    await rec.play([put('Same X', 'mean', { dup: 'mean' })]); await pause(900);
    await rec.play([put('Same X', 'all', { dup: 'all' })]);`),
  node('translate', 'Difference spectrum', `
    await rec.play([put('ΔX', '0', { dx: 0 })]); await pause(1000);
    await rec.play([put('ΔX', '-2', { dx: -2 })]);`, { view: ['curvemath'] }),
  node('filterrows', 'Cleaning a sensor log', `
    await rec.play([put('Repeated', 'first', { dup: 'first' }), put('Keep', '3', { every: 3 })]); await pause(900);
    await rec.play([put('Keep', '1', { every: 1 })]);`),
  node('clean', 'Cleaning a sensor log', `
    await rec.play([put('Outliers', 'median', { outliers: 'median', k: 3 })]); await pause(1000);
    await rec.play([put('Outliers', 'movmedian', { outliers: 'movmedian', k: 5 })]);`, { view: ['plot1d'] }),
  node('digitizer', 'Digitizer', `
    await rec.play([look('svg, canvas, img', 900), click(/^Magnifier$/), look('svg, canvas, img', 1500), click(/^Magnifier$/)]);`),
  node('matrix', 'Matrices', `
    await rec.play([look('table', 1200)]);`),

  // ---- Statistics ----
  node('stats', 'UV-Vis spectrum', `
    await rec.play([put('±Y in the dataset', 'se', { err: 'se' })]); await pause(1000);
    await rec.play([put('±Y in the dataset', 'sd', { err: 'sd' })]);`, { view: ['plot1d'] }),
  node('normality', 'Drug study', `
    await rec.play([look('.stat-report', 900), put('Outliers', 'dixon', { outliers: 'dixon' })]); await pause(900);`),
  node('ttest', 'Drug study', `
    await rec.play([look('.stat-report', 900), put('α', '0.01', { alpha: 0.01 })]); await pause(900);`),
  node('anova', 'Drug study', `
    await rec.play([look('.stat-report', 900), put('Post hoc', 'bonferroni', { post: 'bonferroni' })]); await pause(900);`),
  node('nonparam', 'Drug study', `
    await rec.play([look('.stat-report', 900), put('Post hoc', 'bonferroni', { post: 'bonferroni' })]); await pause(900);`),
  node('correl', 'Drug study', `
    await rec.play([put('Method', 'spearman', { method: 'spearman' })]); await pause(900);
    await rec.play([put('Method', 'kendall', { method: 'kendall' })]);`),

  // ---- Signal and Analysis ----
  node('average', 'Replicate scans', `
    await rec.play([put('Common X', 'union', { grid: 'union' })]); await pause(900);
    await rec.play([put('Read by', 'spline', { method: 'spline' })]);`),
  node('normalize', 'Signal processing', `
    await rec.play([put('Normalize', 'area', { method: 'area' })]); await pause(900);
    await rec.play([put('Normalize', 'minmax', { method: 'minmax' })]);`),
  node('fft', 'Signal processing', `
    await rec.play([put('Output', 'db', { output: 'db' })]); await pause(900);
    await rec.play([put('Mode', 'psd', { mode: 'psd' })]);`),
  node('convolve', 'Signal processing', `
    await rec.play([put('Iterations', '5', { iterations: 5 })]); await pause(1000);
    await rec.play([put('Iterations', '120', { iterations: 120 })]);`),
  node('interp', 'Signal processing', `
    await rec.play([put('Method', 'nearest', { method: 'nearest' })]); await pause(900);
    await rec.play([put('Method', 'spline', { method: 'spline' }), put('Outside', 'linear', { extrap: 'linear' })]);`),
  node('curvemath', 'Difference spectrum', `
    await rec.play([look('svg', 1000), put('On X of', 'a', { grid: 'a' })]); await pause(900);
    await rec.play([put('On X of', 'uniform', { grid: 'uniform' })]);`),
  node('calculus', 'Raman on a fluorescence background', `
    await rec.play([look('svg', 900), tab('Differentiate')]); await pause(1200);
    await rec.play([tab('Integrate')]);`),
  node('peaks', 'Overlapping peaks', `
    await rec.play([look('svg', 900), click(/^Residuals$/)]); await pause(1300);
    await rec.play([click(/^Residuals$/)]);`),
  node('peakwidth', 'Raman on a fluorescence background', `
    await rec.play([look('svg', 900), click(/^Reader$/), look('svg', 1500), click(/^Reader$/)]);`),
  node('pick', 'Cyclic voltammogram', `
    await rec.play([put('Table', 'wide', { layout: 'wide' })]); await pause(900);
    await rec.play([put('Table', 'long', { layout: 'long' })]);`),
  node('matcomp', 'Matrices', `
    await rec.play([look('table', 1500)]);`),
  // (Python loaded and run once before filming: the first start in a browser takes a while)
  {
    ...node('python', 'Python script', `
      const busy = () => /Running the code|Loading/.test(rec.kit.nodeEl(document, id)?.textContent ?? '');
      await rec.play([look('.cm-editor', 1200), click(/^Run$/)]);
      await pause(600);
      for (let k = 0; k < 120 && busy(); k++) await pause(250);
      await pause(1200);`, { hold: 2500 }),
    // (until it has run: no “running” or “loading” left on the node)
    setup: `${node('python', 'Python script', '').setup}
      const pid = rec.ids('python')[0];
      const busy = () => /Running the code|Loading/.test(rec.kit.nodeEl(document, pid)?.textContent ?? '');
      rec.kit.buttonIn(rec.kit.nodeEl(document, pid), /^Allow and run$/)?.click();
      await rec.wait(1500);
      for (let k = 0; k < 300 && busy(); k++) await rec.wait(500);
      await rec.wait(1500);`,
  },

  // ---- Graphs ----
  node('histogram', 'Histogram with two-mode fits', `
    await rec.play([put('Height', 'density', { norm: 'density' })]); await pause(900);
    await rec.play([put('Drawn as', 'step', { look: 'step' })]);`),
  node('barchart', 'Grouped bars', `
    await rec.play([put('Arrangement', 'stacked', { arrange: 'stacked' })]); await pause(1100);
    await rec.play([put('Arrangement', 'grouped', { arrange: 'grouped' })]);`),
  node('boxviolin', 'Box plot vs violin', `
    await rec.play([put('Draw', 'violin', { kind: 'violin' })]); await pause(1100);
    await rec.play([put('Draw', 'raincloud', { kind: 'raincloud' })]);`),
  node('probplot', 'Q-Q and normal probability', `
    await rec.play([put('Kind', 'ecdf', { kind: 'ecdf' })]); await pause(1100);
    await rec.play([put('Kind', 'prob', { kind: 'prob' })]);`),
  node('blandaltman', 'Bland–Altman', `
    await rec.play([put('Y', 'pct', { y: 'pct' })]); await pause(1100);
    await rec.play([put('Limits', 'nonparametric', { loa: 'nonparametric' })]);`),
  node('pie', 'Pie, doughnut', `
    await rec.play([put('Labels', 'percent', { labels: 'percent' })]); await pause(1000);
    await rec.play([put('Start °', '0', { start: 0 })]);`),
  node('polar', 'Polar', `
    await rec.play([put('Draw', 'bars', { mode: 'bars' })]); await pause(1100);
    await rec.play([put('Draw', 'line', { mode: 'line' })]);`),
  node('scattermatrix', 'Scatter matrix', `
    await rec.play([put('Diagonal', 'hist', { diag: 'hist' })]); await pause(1000);
    await rec.play([put('Above', 'scatter', { upper: 'scatter' })]);`),
  node('ternary', 'Ternary', `
    await rec.play([put('Draw', 'linesymbol', { mode: 'linesymbol' })]); await pause(1000);
    await rec.play([put('Draw', 'scatter', { mode: 'scatter' })]);`),
  node('waterfall', 'Waterfall: reflectance', `
    await rec.play([put('Colours', 'viridis', { colorMap: 'viridis' })]); await pause(900);
    await rec.play([put('Fill', 'color', { fill: 'color' })]);`),
  node('contour', 'Contour and heatmap', `
    await rec.play([put('Draw', 'filledLines', { draw: 'filledLines' })]); await pause(1000);
    await rec.play([put('Colours', 'viridis', { cmap: 'viridis' })]);`),
  node('plot3d', '3D: a surface', `
    await rec.play([put('Azimuth', '-30', { azim: -30 })]); await pause(800);
    await rec.play([put('Azimuth', '-100', { azim: -100 })]); await pause(800);
    await rec.play([put('Draw', 'wireframe', { kind: 'wireframe' })]);`),
  node('canvas', 'Strong coupling', `
    await rec.play([putWith('Share Y', 'all', (d) => ({ ...d, layout: { ...d.layout, shareY: 'all' } }))]); await pause(1100);
    await rec.play([putWith('Share Y', 'none', (d) => ({ ...d, layout: { ...d.layout, shareY: 'none' } }))]);`),
  node('drawing', 'Publication figure', `
    await rec.play([click(/^Edit drawing$/)]); await pause(2500);
    await rec.play([lookAt('.drawing-editor svg', 1200), lookAt('.de-close', 400), { kind: 'click', at: (d) => d.querySelector('.de-close') }]);`, { full: true }),
  {
    name: 'plot1d',
    file: 'nodes/plot1d',
    setup: node('plot1d', 'UV-Vis spectrum', '').setup,
    box: node('plot1d', 'UV-Vis spectrum', '').box,
    act: `
      const id = rec.ids('plot1d')[0];
      const style = (f) => (d) => ({ ...d, style: { ...d.style, ...f } });
      await rec.play([
        { kind: 'click', at: rec.kit.optionButton('style') },
        { kind: 'set', at: rec.kit.field('Colour'), text: 'red', apply: { id, f: style({ color: '#c0392b' }) } },
        { kind: 'set', at: rec.kit.field('Width'), text: '2', apply: { id, f: style({ lineWidth: 2 }) } },
        { kind: 'click', at: rec.kit.optionButton('Axes') },
        { kind: 'click', at: rec.kit.optionButton('Y1 left') },
        { kind: 'set', at: rec.kit.field('Text'), text: 'Absorbance (a.u.)', apply: { id, f: (d) => ({ ...d, axes: { ...d.axes, sides: { ...d.axes?.sides, left: { ...d.axes?.sides?.left, title: 'Absorbance (a.u.)' } } } }) } },
      ]);`,
  },
  node('smooth', 'Signal processing', `
    await rec.play([put('Method', 'median', { method: 'median' })]); await pause(900);
    await rec.play([put('Method', 'gauss', { method: 'gauss' })]); await pause(500);
    await rec.play([put('σ', '6', { sigma: 6 })]); await pause(900);
    await rec.play([put('Method', 'savgol', { method: 'savgol' }), put('Window', '21', { points: 21 })]);`),
  node('fit', 'Kinetics', `
    await rec.play([look('svg', 900), click(/^Residuals$/)]); await pause(1500);
    await rec.play([click(/^Residuals$/)]);`),

  // ---- Organizing ----
  {
    name: 'group',
    file: 'nodes/group',
    setup: `await rec.example('Organizing a large graph'); await rec.wait(1800); await rec.panels(false, false); await rec.focus(rec.api.nodes().map((n) => n.id)); await rec.wait(500);`,
    act: `
      const g = rec.ids('subgraph')[0];
      await rec.play([{ kind: 'point', at: (d) => rec.kit.nodeEl(d, rec.ids('frame')[0]), ms: 900 }, { kind: 'point', at: (d) => rec.kit.nodeEl(d, rec.ids('reroute')[0]), ms: 700 }, { kind: 'click', at: (d) => rec.kit.buttonIn(rec.kit.nodeEl(d, g), /^Open$/) }]);
      await rec.wait(400);
      await rec.panels(undefined, false);
      await rec.wait(1200);
      await rec.play([{ kind: 'click', at: (d) => d.querySelector('.group-bar .btn-run') }]);
      await rec.wait(400);
      await rec.panels(undefined, false);
      await rec.wait(600);`,
  },
];
