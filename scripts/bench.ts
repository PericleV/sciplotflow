// Speed with large data (npm run bench): reading a CSV, the graph evaluation, a change of one setting, and the drawing
// of a figure (as SVG text) — for 10⁴ … 10⁶ rows.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluateGraph, newCache } from '../src/engine/evaluate.ts';
import { parseCsv, CSV_DEFAULTS } from '../src/engine/csv.ts';
import { GENCOL_DEFAULTS, MATHCOL_DEFAULTS, PLOT1D_DEFAULTS } from '../src/defaults.ts';
import { CURVE_STYLE_DEFAULTS } from '../src/figure/spec.ts';
import { FigureSvg } from '../src/figure/render.tsx';
import type { AppNode } from '../src/types.ts';
import type { Edge } from '@xyflow/react';

const ms = (t0: number) => `${(performance.now() - t0).toFixed(0)} ms`;

for (const n of [1e4, 1e5, 1e6]) {
  // a CSV of n rows, 3 columns, numbers with a decimal comma
  let text = 'x;y;z\n';
  for (let i = 0; i < n; i++) text += `${i};${Math.sin(i / 100).toFixed(6).replace('.', ',')};${((i % 7) / 3).toFixed(6).replace('.', ',')}\n`;
  let t0 = performance.now();
  const csv = parseCsv(text, CSV_DEFAULTS);
  const tCsv = ms(t0);

  const graph = (mode: 'line' | 'scatter', color: boolean): { nodes: AppNode[]; edges: Edge[] } => ({
    nodes: [
      { id: 'x', type: 'gencol', position: { x: 0, y: 0 }, data: { ...GENCOL_DEFAULTS, count: n, start: 0, stop: 100 } },
      { id: 'm', type: 'mathcol', position: { x: 0, y: 0 }, data: { ...MATHCOL_DEFAULTS, formula: 'sin(A) * exp(-A/50) + if(i > n/2, 0.1, 0)' } },
      { id: 'p', type: 'plot1d', position: { x: 0, y: 0 }, data: { ...PLOT1D_DEFAULTS, label: '', style: { ...CURVE_STYLE_DEFAULTS, mode, ...(color ? { colorBy: 'y' as const } : {}) } } },
    ] as AppNode[],
    edges: [
      { id: '1', source: 'x', sourceHandle: 'out', target: 'm', targetHandle: 'in-0' },
      { id: '2', source: 'x', sourceHandle: 'out', target: 'p', targetHandle: 'x' },
      { id: '3', source: 'm', sourceHandle: 'out', target: 'p', targetHandle: 'y' },
    ],
  });
  const g = graph('line', false);
  const cache = newCache();
  t0 = performance.now();
  let res = evaluateGraph(g.nodes, g.edges, cache);
  const tEval = ms(t0);
  // a style change: only the plot (its figure) is recomputed
  g.nodes[2] = { ...g.nodes[2], data: { ...PLOT1D_DEFAULTS, label: '', style: { ...CURVE_STYLE_DEFAULTS, color: '#ff0000' } } } as AppNode;
  t0 = performance.now();
  res = evaluateGraph(g.nodes, g.edges, cache);
  const tStyle = ms(t0);
  const draw = (r: typeof res) => {
    const fig = r.get('p')!.view.figure!;
    const t = performance.now();
    const svg = renderToStaticMarkup(createElement(FigureSvg, { fig, display: { width: 520, height: 400 }, idPrefix: 'b' }));
    return `${ms(t)} (${(svg.length / 1e6).toFixed(2)} MB)`;
  };
  const tLine = draw(res);
  const tScatter = draw(evaluateGraph(...Object.values(graph('scatter', false)) as [AppNode[], Edge[]]));
  const tColour = draw(evaluateGraph(...Object.values(graph('scatter', true)) as [AppNode[], Edge[]]));
  console.log(`${n.toExponential(0)} rows: CSV ${tCsv} (${csv.dataset.columns.length} columns) · evaluate ${tEval} · style change ${tStyle} · draw line ${tLine} · scatter ${tScatter} · coloured scatter ${tColour}`);
}
