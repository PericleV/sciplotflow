// Tour 2, “Prepare your data” (easy, ~12 min): a sensor measured three times, all in one file, with gaps, a spike and
// a stretch spoiled by an open door, the runs one under the other. Cleaned (Clean data, Filter & sort rows, Data
// manipulation), cut into runs side by side and named (Split into columns, Columns), the offset taken away
// (Translate); new columns (Extract column, Generate column, Math column, Combine columns); a table typed in
// (Workbook); a spreadsheet's sheets gathered (Auto-extract); the canvas kept tidy (Note, Frame). Each node in two
// small steps: added and connected, then its options.
import type { Edge } from '@xyflow/react';
import { AUTOEXTRACT_DEFAULTS, CLEAN_DEFAULTS, COLUMNS_DEFAULTS, COMBINE_DEFAULTS, DATAMANIP_DEFAULTS, EXTRACT_DEFAULTS, FILTER_DEFAULTS, GENCOL_DEFAULTS, IMPORT_DEFAULTS, MATHCOL_DEFAULTS, NOTE_SIZE, TRANSLATE_DEFAULTS, UNSTACK_DEFAULTS, WORKBOOK_DEFAULTS } from '../defaults.ts';
import type { AppNode, ImportSheet, NodeType } from '../types.ts';
import { fedBy, field, nodeEl, nodeOrPalette, ofType, optionButton, wiggle, type Act, type AddSpec, type Step, type Tour, type TourState, type Wire } from './kit.ts';

// ---- the example data ----
// three runs of 0 to 40 s one under the other: Time, Signal (a rise to a plateau over an offset of 12 mV),
// Temperature; a value missing in each run, a spike in run 2, run 1 a little high at 20 to 22 s (the door was open)
export function runsText(): string {
  const gain = [1, 1.08, 0.93];
  const lines = ['Time (s),Signal (mV),Temperature (°C)'];
  for (let r = 0; r < 3; r++)
    for (let t = 0; t <= 40; t++) {
      let y = 12 + 50 * gain[r] * (1 - Math.exp(-t / 8)) + 0.3 * wiggle(t, r + 1);
      if (r === 0 && t >= 20 && t <= 22) y += 2.5;
      if (r === 1 && t === 17) y = 400;
      const gap = (r === 0 && t === 9) || (r === 1 && t === 25) || (r === 2 && t === 14);
      lines.push(`${t},${gap ? '' : y.toFixed(2)},${(21 + 0.04 * t + 0.25 * r + 0.05 * wiggle(t, r + 5)).toFixed(2)}`);
    }
  return lines.join('\n');
}
// a spreadsheet of two days of calibration: Concentration, Signal on each sheet
export function calibrationSheets(): ImportSheet[] {
  return [11.8, 12.3].map((slope, k) => {
    const lines = ['Concentration (mM)\tSignal (mV)'];
    for (const c of [0, 0.5, 1, 2, 4, 8]) lines.push(`${c}\t${(3 + slope * c + 0.2 * wiggle(c, k)).toFixed(2)}`);
    return { name: `Day ${k + 1}`, text: lines.join('\n'), excel: true };
  });
}
const RUNS = 'tour-runs';
const CALIB = 'tour-calibration';
function project(): { nodes: AppNode[]; edges: Edge[] } {
  return {
    nodes: [
      { id: RUNS, type: 'import', position: { x: 0, y: 0 }, data: { ...structuredClone(IMPORT_DEFAULTS), name: 'runs', fileName: 'runs.csv', textId: 'tour-runs', text: runsText() } },
      { id: CALIB, type: 'import', position: { x: 0, y: 760 }, data: { ...structuredClone(IMPORT_DEFAULTS), name: 'calibration', fileName: 'calibration.xlsx', textId: 'tour-calib', text: '', sheets: calibrationSheets(), sheet: 0 } },
    ] as AppNode[],
    edges: [],
  };
}

// ---- the nodes the steps make ----
type N<T extends NodeType> = Extract<AppNode, { type: T }>;
const clean = (s: TourState) => fedBy(s, 'clean', ['import']);
const filter = (s: TourState) => fedBy(s, 'filterrows', ['clean', 'import']);
const manip = (s: TourState) => fedBy(s, 'datamanip', ['filterrows', 'clean', 'import']);
const split = (s: TourState) => fedBy(s, 'unstack', ['datamanip', 'filterrows', 'clean', 'import']);
const columns = (s: TourState) => fedBy(s, 'columns', ['unstack']);
const translate = (s: TourState) => fedBy(s, 'translate', ['columns', 'unstack']);
const extract = (s: TourState) => fedBy(s, 'extract', ['translate', 'columns', 'unstack']);
const gencol = (s: TourState) => ofType(s, 'gencol').at(-1);
const mathcol = (s: TourState) => fedBy(s, 'mathcol', ['gencol', 'extract']);
const combine = (s: TourState) => ofType(s, 'combine').find((n) => s.edges.filter((e) => e.target === n.id).length >= 2);
const book = (s: TourState) => ofType(s, 'book').find((n) => !s.edges.some((e) => e.target === n.id));
const auto = (s: TourState) => ofType(s, 'autoextract').find((n) => s.edges.some((e) => e.target === n.id && e.sourceHandle === 'book'));
const note = (s: TourState) => ofType(s, 'note').at(-1);
const frame = (s: TourState) => ofType(s, 'frame').find((f) => s.nodes.some((n) => n.parentId === f.id));
// the node the next one is fed by: the newest of the steps before
const last = (s: TourState, ...fs: ((s: TourState) => AppNode | undefined)[]) => fs.map((f) => f(s)).find(Boolean);
const wire = (id: string | undefined, to: string, handle?: string): Wire[] => (id ? [{ id, to, handle }] : []);

// a step that adds a node (taken from the Nodes panel by its title) and connects it
function adds(title: string, palette: string, text: string, made: (s: TourState) => AppNode | undefined, spec: (s: TourState) => AddSpec | null): Step {
  return {
    title,
    text,
    target: (doc, s) => nodeOrPalette(doc, made(s), palette),
    done: (s) => !!made(s),
    demo: (s) => {
      const sp = spec(s);
      return sp ? [{ kind: 'add', spec: sp, palette }] : null;
    },
  };
}
// a step that sets a node's options: done when they are as wanted; shown on the node selected. Lit: the node until it
// is selected, then its first field (or the Options panel; in the node itself when `first` is 'node')
function sets<T extends NodeType>(title: string, text: string, made: (s: TourState) => N<T> | undefined, ok: (n: N<T>) => boolean, acts: (n: N<T>) => Act[], first?: string): Step {
  return {
    title,
    text,
    target: (doc, s) => {
      const n = made(s);
      if (!n) return null;
      if (!n.selected || first === 'node') return nodeEl(doc, n.id);
      // the field itself, in Options or on the node
      const at = first && field(first)(doc, s);
      if (at) return at;
      const open = doc.querySelector('.inspector.overlay');
      if (!open) return doc.querySelector('.inspector.folded .palette-toggle');
      return open.querySelector('.palette-list');
    },
    done: (s) => {
      const n = made(s);
      return !!n && ok(n);
    },
    demo: (s) => {
      const n = made(s);
      return n ? [...(n.selected ? [] : [{ kind: 'select' as const, id: n.id }]), ...acts(n)] : null;
    },
  };
}
// a value put in a field of the node's options
const put = (id: string, label: string, text: string, patch: Record<string, unknown>): Act => ({ kind: 'set', at: field(label), text, apply: { id, f: (d) => ({ ...d, ...patch }) } });
const inNode = (id: string, sel: string) => (doc: Document) => nodeEl(doc, id)?.querySelector(sel) ?? nodeEl(doc, id);
const inOptions = (sel: string) => (doc: Document) => doc.querySelector(`.inspector.overlay ${sel}`);
// a field of a two-column form (a label, then its control), by the label's text
const labelled = (text: string) => (doc: Document) => {
  const next = [...doc.querySelectorAll('.inspector.overlay .col-form > span')].find((e) => e.textContent?.trim() === text)?.nextElementSibling;
  return next?.matches('select, textarea, input') ? next : (next?.querySelector('select, textarea, input') ?? null);
};

export const PREPARE: Tour = {
  id: 'prepare-data',
  title: 'Prepare your data',
  level: 'Easy',
  minutes: 12,
  desc: 'Clean a messy file, split it into runs and name them, make new columns, type a small table, gather a spreadsheet and keep the canvas tidy.',
  project,
  chapters: [
    {
      title: 'Clean it',
      steps: [
        {
          title: 'A messy file',
          text: 'The **runs** node holds a sensor that was measured three times, all in one file. You can see **Time** start again at 0 for each run.\n\nThe file has a few problems: one value is missing in each run, run 2 has a spike of 400 mV, and in run 1 someone left the door open at 20 to 22 s. Let us fix all of that.',
          target: (doc) => nodeEl(doc, RUNS),
        },
        {
          title: 'How nodes connect',
          text: 'Each node takes its data through a connection. Outputs are on the right side of a node, inputs on the left. To connect two nodes, drag from an output dot to an input dot.\n\nPress **Show me** on any step to watch it being done.',
          target: (doc) => nodeEl(doc, RUNS)?.querySelector('.react-flow__handle.source') ?? null,
        },
        adds('Add Clean data', 'Clean data', 'Find **Clean data** in the Nodes panel on the left and drag it onto the canvas. Then connect the output of **runs** to its input.', clean, () => ({ type: 'clean', data: structuredClone(CLEAN_DEFAULTS), from: wire(RUNS, 'in') })),
        sets<'clean'>(
          'Fill the gaps, remove the spike',
          'In the options of Clean data:\n\n**Missing**: filled: straight lines.\n**Outliers**: k MAD from the moving median.\n**Then**: replaced: straight lines from the neighbours.\n\nThe spike disappears and no row is lost.',
          clean,
          (n) => n.data.missing !== 'keep' && n.data.outliers === 'movmedian',
          (n) => [put(n.id, 'Missing', 'filled: straight lines', { missing: 'linear' }), put(n.id, 'Outliers', 'k MAD from the moving median', { outliers: 'movmedian', window: 5, k: 3 }), put(n.id, 'Then', 'replaced: straight lines from the neighbours', { action: 'linear' })],
          'Missing',
        ),
        adds('Add Filter & sort rows', 'Filter & sort rows', 'The first 3 seconds of each run are the sensor warming up. Add **Filter & sort rows** and connect Clean data to it.', filter, (s) => ({ type: 'filterrows', data: structuredClone(FILTER_DEFAULTS), from: wire(last(s, clean)?.id ?? RUNS, 'in') })),
        sets<'filterrows'>(
          'Keep only t ≥ 3 s',
          'In Options, set **Rows** to **rule** and write `x >= 3` in **Where**. Here x means the X column, which is Time.\n\nBelow it you can also sort the rows, by one column or several, and keep only the first few.',
          filter,
          (n) => n.data.rows.mode === 'rule' && !!n.data.rows.rule?.trim(),
          (n) => [put(n.id, 'Rows', 'rule', { rows: { mode: 'rule', rule: '' } }), put(n.id, 'Where', 'x >= 3', { rows: { mode: 'rule', rule: 'x >= 3' } })],
          'Rows',
        ),
        adds('Add Data manipulation', 'Data manipulation', 'Some points are wrong for a reason only you know, like the open door in run 1. Add **Data manipulation** and connect the filter to it.', manip, (s) => ({ type: 'datamanip', data: structuredClone(DATAMANIP_DEFAULTS), from: wire(last(s, filter, clean)?.id ?? RUNS, 'in') })),
        {
          ...sets<'datamanip'>(
            'Mask the open-door points',
            'On its graph, drag a box around the points of run 1 between 20 and 22 s, then press **Mask**.\n\nMasked points stay in the table but every node after this one leaves them out.',
            manip,
            (n) => n.data.ops.length > 0,
            () => [],
          ),
          demo: (s) => {
            const n = manip(s);
            const from = last(s, filter, clean)?.id ?? RUNS;
            const v = s.value?.(from);
            const t = v?.t === 'dataset' ? v.v.columns[0].values : null;
            const at = t ? [20, 22].map((x) => Array.prototype.indexOf.call(t, x) as number) : [];
            if (!n || !t || at.some((i) => i < 0)) return null;
            const rows = `${at[0] + 1}-${at[1] + 1}`;
            return [
              ...(n.selected ? [] : [{ kind: 'select' as const, id: n.id }]),
              { kind: 'point', at: inNode(n.id, 'svg'), ms: 500 },
              { kind: 'set', at: optionButton('Mask'), text: 'run 1, 20 to 22 s', apply: { id: n.id, f: (d) => ({ ...d, ops: [{ kind: 'mask', rows, n: t.length }] }) } },
            ];
          },
        },
      ],
    },
    {
      title: 'Shape it',
      steps: [
        adds('Add Split into columns', 'Split into columns', 'Three runs one under the other are easier to use side by side. Add **Split into columns** and connect Data manipulation to it.\n\nIt notices where Time starts again and cuts the table there.', split, (s) => ({ type: 'unstack', data: structuredClone(UNSTACK_DEFAULTS), from: wire(last(s, manip, filter, clean)?.id ?? RUNS, 'in') })),
        sets<'unstack'>('Split only the signal', 'Under **Columns**, choose **Signal (mV)**. Temperature is left out.\n\nThe graph of the node shows the cuts. You can move them or add your own.', split, (n) => n.data.ys !== '', (n) => [put(n.id, 'Columns', 'Signal (mV)', { ys: 'Signal (mV)' })], 'Columns'),
        adds('Add Columns', 'Columns', 'Now give the runs proper names. Add **Columns** and connect Split into columns to it.', columns, (s) => ({ type: 'columns', data: structuredClone(COLUMNS_DEFAULTS), from: wire(split(s)?.id, 'in') })),
        sets<'columns'>(
          'Name the runs',
          'Open **Rename several columns**. Choose **the Y columns** and write `Run 1, Run 2, Run 3` in **New names**.\n\nColumns can also hide columns, reorder them and say which one is X or Y.',
          columns,
          (n) => !!n.data.names?.trim(),
          (n) => [
            { kind: 'click', soft: true, at: (doc) => (doc.querySelector<HTMLDetailsElement>('.inspector.overlay details.sub')?.open ? null : doc.querySelector('.inspector.overlay details.sub > summary')) },
            { kind: 'set', at: labelled('Columns'), text: 'the Y columns', apply: { id: n.id, f: (d) => ({ ...d, renameOn: 'y' }) } },
            { kind: 'set', at: labelled('New names'), text: 'Run 1, Run 2, Run 3', apply: { id: n.id, f: (d) => ({ ...d, names: 'Run 1, Run 2, Run 3' }) } },
          ],
        ),
        adds('Add Translate', 'Translate', 'The sensor reads 12 mV even when there is nothing to measure. Add **Translate** and connect Columns to it.', translate, (s) => ({ type: 'translate', data: structuredClone(TRANSLATE_DEFAULTS), from: wire(last(s, columns, split)?.id, 'data') })),
        sets<'translate'>('Take away the offset', 'Keep **Move** on **by values** and set **ΔY** to −12. Now every run starts from 0.\n\nTranslate can also move a curve so that one of its points, like the maximum, lands where you want.', translate, (n) => n.data.dy !== 0 || n.data.dx !== 0 || n.data.mode !== 'value', (n) => [put(n.id, 'ΔY', '-12', { dy: -12 })], 'ΔY'),
      ],
    },
    {
      title: 'New columns',
      steps: [
        adds('Add Extract column', 'Extract column', 'Many nodes want a single column, not a whole table. Add **Extract column** and connect Translate to it.', extract, (s) => ({ type: 'extract', data: structuredClone(EXTRACT_DEFAULTS), from: wire(last(s, translate, columns)?.id, 'in') })),
        sets<'extract'>('Pick Run 2', 'Choose **Run 2** in **Column**.', extract, (n) => n.data.column !== '', (n) => [put(n.id, 'Column', 'Run 2', { column: 'Run 2', index: 0 })], 'Column'),
        adds('Add Generate column', 'Generate column', 'You can also make a column from nothing. Add **Generate column**. It does not need any input.', gencol, (s) => ({ type: 'gencol', data: structuredClone(GENCOL_DEFAULTS), from: [], near: extract(s)?.id })),
        sets<'gencol'>(
          'A column of times',
          'Name it `Time (s)`. Set **Values** to **from a start, by a step**, then start 3, step 1 and **Rows** 38. That gives 3, 4, 5 … 40 s, the times of the runs.',
          gencol,
          (n) => n.data.mode === 'step',
          (n) => [put(n.id, 'Name', 'Time (s)', { name: 'Time (s)' }), put(n.id, 'Values', 'from a start, by a step', { mode: 'step', start: 3, step: 1 }), put(n.id, 'Rows', '38', { count: 38 })],
          'Name',
        ),
        adds('Add Math column', 'Math column', 'Let us make a model of the rise. Add **Math column** and connect Generate column to its first input, **A**.', mathcol, (s) => ({ type: 'mathcol', data: structuredClone(MATHCOL_DEFAULTS), from: wire(gencol(s)?.id, 'in-0') })),
        sets<'mathcol'>(
          'Write the formula',
          'Write `50*(1 - exp(-A/8))` after the **=** sign and name the result `Model (mV)`.\n\nThe inputs are called A, B, C … and the usual functions work: exp, log, sqrt, sin and more.',
          mathcol,
          (n) => n.data.formula.trim() !== '',
          (n) => [
            { kind: 'set', at: inOptions('.formula-row textarea, .formula-row input'), text: '50*(1 - exp(-A/8))', apply: { id: n.id, f: (d) => ({ ...d, formula: '50*(1 - exp(-A/8))' }) } },
            put(n.id, 'Name', 'Model (mV)', { name: 'Model (mV)' }),
          ],
        ),
        adds(
          'Add Combine columns',
          'Combine columns',
          'Put the three columns in one table. Add **Combine columns** and connect **Generate column** to A, **Extract column** to B and **Math column** to C.',
          combine,
          (s) => ({ type: 'combine', data: structuredClone(COMBINE_DEFAULTS), from: [...wire(gencol(s)?.id, 'in-0'), ...wire(extract(s)?.id, 'in-1'), ...wire(mathcol(s)?.id, 'in-2')] }),
        ),
        sets<'combine'>('Side by side', 'Set **How** to **side by side**. You get one table with Time, Run 2 and the model, ready for a graph.\n\nCombine can also stack columns or tables one under the other.', combine, (n) => n.data.how === 'side', (n) => [put(n.id, 'How', 'side by side', { how: 'side' })], 'How'),
      ],
    },
    {
      title: 'More sources',
      steps: [
        adds('Add a Workbook', 'Workbook', 'Values you wrote down by hand go in a **Workbook**. Add one to the canvas.', book, (s) => ({ type: 'book', data: structuredClone(WORKBOOK_DEFAULTS), from: [], near: combine(s)?.id })),
        sets<'book'>(
          'Type a small table',
          'Click a cell of the Workbook and type, or paste a table you copied from a spreadsheet. A Workbook can have several sheets.',
          book,
          (n) => n.data.sheets.some((q) => q.text.trim() !== ''),
          (n) => [{ kind: 'set', at: inNode(n.id, '.sheet-scroll'), text: 'Sample  Mass (mg)\nA  12.1\nB  11.8\nC  12.4', apply: { id: n.id, f: (d) => ({ ...d, name: 'samples', sheets: [{ name: 'Sheet1', text: 'Sample\tMass (mg)\nA\t12.1\nB\t11.8\nC\t12.4' }] }) } }],
          'node',
        ),
        adds(
          'Gather a spreadsheet',
          'Auto-extract',
          'The **calibration** node holds a spreadsheet with two sheets, one per day. Add **Auto-extract** and connect the **workbook** output of calibration to it (the dot with a ring).\n\nYou get the columns of every sheet in one table, named after their sheet, so both days fit on one graph.',
          auto,
          () => ({ type: 'autoextract', data: structuredClone(AUTOEXTRACT_DEFAULTS), from: wire(CALIB, 'in', 'book') }),
        ),
      ],
    },
    {
      title: 'Keep it tidy',
      steps: [
        adds('Add a Note', 'Note', 'Add a **Note** next to your nodes.', note, (s) => ({ type: 'note', data: { text: '' }, from: [], size: NOTE_SIZE, near: last(s, translate)?.id })),
        sets<'note'>(
          'Write what you did',
          'Click inside the note and write what you did and why, for example why the first 3 seconds were left out. Tour 6 shows everything a note can do.',
          note,
          (n) => n.data.text.trim() !== '',
          (n) => [
            {
              kind: 'set',
              at: inNode(n.id, 'textarea'),
              text: 'Settling (t < 3 s) left out. Run 1 masked at 20 to 22 s (door open). Offset of 12 mV removed.',
              apply: { id: n.id, f: (d) => ({ ...d, text: 'Settling (t < 3 s) left out. Run 1 masked at 20 to 22 s (door open). Offset of 12 mV removed.' }) },
            },
          ],
          'node',
        ),
        {
          title: 'Put them in a frame',
          text: 'Select the three cleaning nodes: hold **Shift** and drag a box around them. Then right-click the selection and choose **Frame**.\n\nGive the frame a name. Moving the frame moves everything inside it.',
          target: (doc, s) => nodeEl(doc, (frame(s) ?? clean(s))?.id),
          done: (s) => !!frame(s),
          show: (api, s) => {
            const ids = [clean(s), filter(s), manip(s)].filter(Boolean).map((n) => n!.id);
            if (ids.length) api.frame(ids, 'Cleaning');
          },
        },
        {
          title: 'Well done!',
          text: 'Your data are ready: **cleaned, split, named and shifted**, with new columns next to them.\n\nPut another measurement in **runs** and all of it runs again by itself. The next tour works with spectra and signals: averages, smoothing, peaks and fits.',
        },
      ],
    },
  ],
};
