// Tour 1, “Your first graph” (simple, ~3 min): a data file (or the example spectrum), its columns plotted, a curve's
// colour and an axis title changed, the figure saved.
import type { Edge } from '@xyflow/react';
import type { AppNode, CurveRow, Plot1DData } from '../types.ts';
import { buttonIn, field, nodeEl, ofType, optionButton, optionsOf, wiggle, type Tour, type TourState } from './kit.ts';

const imported = (n: AppNode) => n.type === 'import' && (n.data.text.trim() !== '' || !!n.data.sheets?.length);
export const importWithData = (s: { nodes: AppNode[] }) => s.nodes.find(imported);
// a Plot fed by an Import
export const plotOfImport = (s: { nodes: AppNode[]; edges: Edge[] }) => {
  const src = new Set(s.nodes.filter(imported).map((n) => n.id));
  return ofType(s, 'plot1d').find((p) => s.edges.some((e) => e.target === p.id && src.has(e.source)));
};
// the look of a Plot's curves, the titles of its axes (to tell a change from how the step found them)
const curveLook = (d: Plot1DData) => JSON.stringify([d.style, (d.rows ?? []).map((r: CurveRow) => r.style)]);
const axisTitles = (d: Plot1DData) => JSON.stringify(['bottom', 'left', 'top', 'right'].map((k) => d.axes?.sides?.[k as 'left']?.title ?? ''));
const changed = (s: TourState, f: (d: Plot1DData) => string) => {
  const p = plotOfImport(s);
  if (!p) return false;
  const before = s.start.find((n) => n.id === p.id);
  return !!before && before.type === 'plot1d' && f(before.data) !== f(p.data);
};
export const figureSaved = (s: TourState) => s.downloads.some((f) => /\.(svg|png|pdf|tiff?)$/i.test(f));

// the example data: an absorption spectrum of two samples (two bands each, a little noise), 300 to 800 nm
export function uvVisText(): string {
  const band = (l: number, c: number, w: number) => Math.exp(-(((l - c) / w) ** 2));
  const lines = ['Wavelength (nm),Sample A,Sample B'];
  for (let l = 300; l <= 800; l += 2) {
    const a = 0.82 * band(l, 425, 38) + 0.34 * band(l, 565, 52) + 0.04 + 0.004 * wiggle(l, 1);
    const b = 0.61 * band(l, 440, 42) + 0.48 * band(l, 590, 55) + 0.05 + 0.004 * wiggle(l, 2);
    lines.push(`${l},${a.toFixed(4)},${b.toFixed(4)}`);
  }
  return lines.join('\n');
}

const plotButton = (doc: Document, s: { nodes: AppNode[] }) => buttonIn(nodeEl(doc, importWithData(s)?.id), /^Plot…$/);
const makeButton = (doc: Document) => buttonIn(doc.querySelector('.plot-dialog'), /^Make the figure/);
const svgButton = (doc: Document, s: { nodes: AppNode[]; edges: Edge[] }) => buttonIn(nodeEl(doc, plotOfImport(s)?.id), /^SVG$/);

export const FIRST: Tour = {
  id: 'first-graph',
  title: 'Your first graph',
  level: 'Simple',
  minutes: 3,
  desc: 'Open a data file, plot it, give the curve a colour and the axis a name, then save the figure.',
  chapters: [
    {
      title: 'Your data',
      steps: [
        {
          title: 'Bring in a data file',
          text: 'Drop a data file on the canvas (CSV, text or Excel). You can also click **Import** in the Nodes panel on the left and open your file there.\n\nNo file at hand? Press **Use the example file**. It is the absorption spectrum of two samples.',
          done: (s) => !!importWithData(s),
          action: { label: 'Use the example file', run: (api) => api.importText('uv-vis.csv', uvVisText()) },
        },
        {
          title: 'This is your table',
          text: 'The **Import** node shows your file as a table.\n\nLook at the row **plot as**. It tells a graph what each column is: the first column is X, the others are Y. You can change them there if you need to.',
          target: (doc, s) => nodeEl(doc, importWithData(s)?.id),
        },
      ],
    },
    {
      title: 'Your graph',
      steps: [
        {
          title: 'Plot the columns',
          text: 'Press **Plot…** on the Import node. A window opens where you pick the X and Y columns. They are already picked for you, so just press **Make the figure** at the bottom.',
          target: (doc, s) => makeButton(doc) ?? plotButton(doc, s),
          done: (s) => !!plotOfImport(s),
          demo: () => [
            { kind: 'click', at: plotButton },
            { kind: 'click', at: (doc) => makeButton(doc) },
          ],
        },
        {
          title: 'Open the plot options',
          text: 'A new node appeared: the **1D plot**. It is your whole figure, with its page, axes, curves and legend.\n\nClick it. Its options open in the **Options** panel on the right.',
          target: (doc, s) => nodeEl(doc, plotOfImport(s)?.id),
          done: (s) => !!plotOfImport(s)?.selected,
          demo: (s) => {
            const p = plotOfImport(s);
            return p ? [{ kind: 'select', id: p.id }] : null;
          },
        },
        {
          title: 'Give a curve a colour',
          text: 'In Options, every curve has its own row. Press **style** on the first one, then pick a **Colour**. You can change the line **Width** right below it.\n\nThe graph changes as you go. Ctrl+Z undoes a change.',
          target: (doc, s) => optionsOf(doc, s, plotOfImport(s)?.id, /^style$/),
          done: (s) => changed(s, curveLook),
          demo: (s) => {
            const p = plotOfImport(s);
            if (!p) return null;
            return [
              ...(p.selected ? [] : [{ kind: 'select' as const, id: p.id }]),
              { kind: 'click', at: optionButton('style') },
              { kind: 'set', at: field('Colour'), text: 'red', apply: { id: p.id, f: (d) => ({ ...d, style: { ...(d as Plot1DData).style, color: '#c0392b' } }) } },
              { kind: 'set', at: field('Width'), text: '2', apply: { id: p.id, f: (d) => ({ ...d, style: { ...(d as Plot1DData).style, lineWidth: 2 } }) } },
            ];
          },
        },
        {
          title: 'Name an axis',
          text: 'Further down, open the **Axes** tab and then **Y1 left**. Write the axis title in **Text**, for example Absorbance (a.u.).\n\nIf you leave it empty, the axis uses the column name. Tip: x_{2} gives a subscript and \\lambda gives λ.',
          target: (doc, s) => optionsOf(doc, s, plotOfImport(s)?.id, /^Axes$/),
          done: (s) => changed(s, axisTitles),
          demo: (s) => {
            const p = plotOfImport(s);
            if (!p) return null;
            return [
              ...(p.selected ? [] : [{ kind: 'select' as const, id: p.id }]),
              { kind: 'click', at: optionButton('Axes') },
              { kind: 'click', at: optionButton('Y1 left') },
              {
                kind: 'set',
                at: field('Text'),
                text: 'Absorbance (a.u.)',
                apply: {
                  id: p.id,
                  f: (d) => {
                    const axes = (d as Plot1DData).axes ?? {};
                    return { ...d, axes: { ...axes, sides: { ...axes.sides, left: { ...axes.sides?.left, title: 'Absorbance (a.u.)' } } } };
                  },
                },
              },
            ];
          },
        },
      ],
    },
    {
      title: 'Your figure',
      steps: [
        {
          title: 'Save the figure',
          text: 'Under the graph you will find the save buttons. **SVG** stays sharp at any size and keeps the real size in mm, which is what Word, PowerPoint and journals like. **PNG** and **TIFF** are pictures at the dpi you choose.\n\nPress **SVG**.',
          target: svgButton,
          done: figureSaved,
          demo: () => [{ kind: 'click', at: svgButton }],
        },
        {
          title: 'Well done!',
          text: 'That is the whole path: **data, graph, figure**. Everything stays connected. Put another file in the Import node and the figure updates by itself.\n\nYour project is kept in this browser, under **Projects**. **Save** gives you a file you can keep or send. The next tour shows how to get messy data ready.',
        },
      ],
    },
  ],
};
