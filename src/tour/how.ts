// The tutorial, “How SciPlotFlow works” (the first tour, ~3 min): what a node is, its ports and what they carry, a node
// added and connected (Show me drags it from the Nodes panel and draws the connection), a setting changed and everything
// after it following, the data on a connection seen with Inspect, where the project is kept.
import type { AppNode, SmoothData } from '../types.ts';
import { SMOOTH_DEFAULTS } from '../defaults.ts';
import { importWithData, uvVisText } from './first.ts';
import { byId, fedBy, field, nodeEl, type Tour, type TourState } from './kit.ts';

// the Smooth fed by the Import of the example (or of the user's file)
const smoothOf = (s: { nodes: AppNode[]; edges: TourState['edges'] }) => fedBy(s, 'smooth', ['import']);
// its settings changed since the step began
const smoothChanged = (s: TourState) => {
  const n = smoothOf(s);
  const before = byId({ nodes: s.start }, n?.id);
  return !!n && !!before && JSON.stringify(before.data) !== JSON.stringify(n.data);
};
const inspectButton = (doc: Document) => [...doc.querySelectorAll('.toolbar button')].find((b) => b.textContent?.trim() === 'Inspect') ?? null;
const outPort = (doc: Document, s: TourState) => nodeEl(doc, importWithData(s)?.id)?.querySelector('.react-flow__handle.source') ?? null;

export const HOW: Tour = {
  id: 'how-it-works',
  title: 'How SciPlotFlow works',
  level: 'Start here',
  minutes: 3,
  desc: 'Nodes, their ports and connections: data flowing from one step to the next, a setting changed and everything after it updated, the data on a connection inspected.',
  chapters: [
    {
      title: 'Nodes',
      steps: [
        {
          title: 'An analysis made of nodes',
          text: 'In SciPlotFlow every step of an analysis is a **node**: reading a file, cleaning it, smoothing a curve, fitting a peak, drawing the figure.\n\nNodes are joined by **connections**. Data go along them from left to right, from what a node gives to the next node that uses it. Change anything, and everything after it is computed again by itself.',
        },
        {
          title: 'Some data to start with',
          text: 'Press **Use the example file** below: an absorption spectrum of two samples. It comes in an **Import** node, the node that reads a file and shows it as a table.\n\nYou can also drop your own file (CSV, text, Excel) on the canvas.',
          done: (s) => !!importWithData(s),
          action: { label: 'Use the example file', run: (api) => api.importText('uv-vis.csv', uvVisText()) },
        },
        {
          title: 'Ports: what goes in, what comes out',
          text: 'The small circles on the sides of a node are its **ports**. On the right are the **outputs** (what the node gives), on the left the **inputs** (what it needs).\n\nTheir colour says what they carry: **blue** a table, **purple** a workbook of several tables, **green** one column, **red** one value, **orange** a figure. An output connects to an input of the same colour.',
          target: outPort,
        },
      ],
    },
    {
      title: 'Connections',
      steps: [
        {
          title: 'Add a node and connect it',
          text: 'Open the **Nodes** panel on the left and drag **Smooth** (under Signals) onto the canvas.\n\nThen drag from the **dataset** output of the Import (its circle on the right) to the **dataset** input of Smooth (on its left). A line joins them: the table now goes into Smooth, which smooths every Y column and draws it.\n\nStuck? Press **Show me** and watch it done.',
          target: (doc, s) => (smoothOf(s) ? nodeEl(doc, smoothOf(s)!.id) : outPort(doc, s)),
          done: (s) => !!smoothOf(s),
          demo: (s) => {
            const imp = importWithData(s);
            if (!imp) return null;
            return [{ kind: 'add', palette: 'Smooth', spec: { type: 'smooth', data: { ...SMOOTH_DEFAULTS }, from: [{ id: imp.id, handle: 'out', to: 'in' }] } }];
          },
        },
        {
          title: 'Change a setting',
          text: 'Click the **Smooth** node: its options open in the **Options** panel on the right. Make the **Window** larger, for example 31 points.\n\nThe smoothed curve changes at once, and so would every node connected after it. There is no Run button: the graph is always up to date. Ctrl+Z undoes a change.',
          target: (doc, s) => nodeEl(doc, smoothOf(s)?.id),
          done: smoothChanged,
          demo: (s) => {
            const n = smoothOf(s);
            if (!n) return null;
            return [
              ...(n.selected ? [] : [{ kind: 'select' as const, id: n.id }]),
              { kind: 'set', at: field('Window'), text: '31', apply: { id: n.id, f: (d) => ({ ...d, points: 31 } as SmoothData) } },
            ];
          },
        },
      ],
    },
    {
      title: 'Your data, step by step',
      steps: [
        {
          title: 'See what goes along a connection',
          text: 'Press **Inspect** in the top bar, then click a node or a connection. Its data appear in the Options panel as a table: every column with its name and what it is (X, Y …), as many rows as you like.\n\nThis is how to check, at any step, exactly what a node gives. Press **Inspect** again to stop.',
          target: inspectButton,
          demo: (s) => {
            const n = smoothOf(s);
            return [{ kind: 'click', at: inspectButton }, ...(n ? [{ kind: 'click' as const, at: (doc: Document) => nodeEl(doc, n.id) }] : [])];
          },
        },
        {
          title: 'Your project is kept',
          text: 'Everything you do is kept in this browser as you go, under **Projects** in the top bar. **Save** writes the project to a file you can keep, send or open on another computer.\n\nThe figures are saved from a Plot node as **SVG**, **PNG**, **TIFF** or **PDF**, at their real size.',
        },
        {
          title: 'You are ready',
          text: 'That is all there is to it: **nodes**, **connections**, data flowing from one to the next.\n\nNext: **Your first graph** draws a publication figure, **Prepare your data** gets a messy file ready. Or open one of the many **examples** in the Welcome window and change it: every node has a **?** with what it does.',
        },
      ],
    },
  ],
};
