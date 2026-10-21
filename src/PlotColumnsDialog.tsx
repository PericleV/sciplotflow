// “Plot these columns”: from a dataset (or the sheets of a workbook), the curves — each its sheet, X, Y and errors (A–B
// from one sheet, D–F from another, C–D from the first again …) —, how they are drawn or which graph is made of them,
// and where they go: a new Plot (one, one per sheet or per curve, in a Merge if asked) or a Plot already there. The
// nodes are made and connected next to the data — a first figure in a few seconds, the graph there to change.
import { useState } from 'react';
import { errorTargets } from './engine/errcols.ts';
import { curvesByRole, titleOf, type Dataset } from './engine/table.ts';
import { is1D, XYZ, type GraphKind, type PlotChoice, type PlotCurve } from './plotBuild.ts';
import { X_LAYOUTS, Y_LAYOUTS, type XLayout, type YLayout } from './figure/multiAxes.ts';
import { stylesFor } from './nodes/styles.ts';
import type { NodeType } from './types.ts';
import { X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';

export type { PlotChoice } from './plotBuild.ts';

const GRAPHS_1D: [GraphKind, string][] = [
  ['linesymbol', 'lines and symbols'],
  ['line', 'lines'],
  ['scatter', 'symbols (scatter)'],
  ['step', 'steps'],
  ['spline', 'smooth lines (spline)'],
  ['area', 'areas (filled to 0)'],
  ['stacked', 'stacked areas'],
  ['lollipop', 'lollipops'],
];
const GRAPHS_OTHER: [GraphKind, string][] = [
  ['barchart', 'Bar chart'],
  ['histogram', 'Histogram'],
  ['boxviolin', 'Box & violin'],
  ['pie', 'Pie chart'],
  ['polar', 'Polar'],
  ['waterfall', 'Waterfall'],
];
const GRAPHS_3D: [GraphKind, string][] = [
  ['scatter3d', '3D scatter (X, Y, Z)'],
  ['lines3d', '3D lines (X, Y, Z)'],
  ['surface', 'Surface (X, Y, Z)'],
  ['wireframe', 'Wireframe (X, Y, Z)'],
  ['bars3d', '3D bars (X, Y, Z)'],
  ['waterfall3d', '3D waterfall (X, the Y columns)'],
];
// what the X of the first curve is for another graph (none: its X not used)
const X_ROLE: Partial<Record<GraphKind, string>> = { barchart: 'Categories', pie: 'Categories', polar: 'Angle', waterfall: 'X', waterfall3d: 'X', scatter3d: 'X', lines3d: 'X', surface: 'X', wireframe: 'X', bars3d: 'X' };

// the curves the designations of a sheet ask for, every ±Y found by name (SD, SE, err …) taken as its Y's error
function designated(ds: Dataset, sheet: string | undefined): PlotCurve[] {
  const names = ds.columns.map((c) => c.name);
  const first = curvesByRole(ds.columns).curves.map((c) => ({ y: c.y, yerr: c.yerr ?? '', x: c.x ?? '' }));
  const targets = errorTargets(names, first.filter((v) => !v.yerr).map((v) => v.y));
  const used = new Set([...first.map((v) => v.yerr).filter(Boolean), ...targets.values()]);
  return first.filter((v) => !used.has(v.y)).map((v) => ({ ...(sheet ? { sheet } : {}), x: v.x, y: v.y, yerr: v.yerr || targets.get(v.y) || '', xerr: '' }));
}

// shown: the dataset shown (its sheet: shownSheet); sheets: all the sheets of its workbook (none: a dataset alone);
// plots: the Plots already in the project (id, name) the curves can go to
export function PlotColumnsDialog({ name, shown, sheets, shownSheet, plots, onDone, onClose }: { name: string; shown: Dataset; sheets?: Dataset[]; shownSheet?: string; plots: [string, string][]; onDone: (c: PlotChoice & { style: string }) => void; onClose: () => void }) {
  const book = !!sheets && sheets.length > 0;
  const sheetOf = (nm: string | undefined) => (book ? (sheets.find((s) => s.name === nm) ?? sheets.find((s) => s.name === shownSheet) ?? sheets[0]) : shown);
  const colsOf = (nm: string | undefined) => sheetOf(nm).columns;
  const first = book ? (shownSheet ?? sheets[0].name) : undefined;
  const [curves, setCurves] = useState<PlotCurve[]>(() => designated(shown, first));
  const rows = Math.max(0, ...curves.map((q) => colsOf(q.sheet).find((c) => c.name === q.y)?.values.length ?? 0));
  const [graph, setGraph] = useState<GraphKind | 'auto'>('auto');
  const drawn: GraphKind = graph === 'auto' ? (rows <= 60 ? 'linesymbol' : 'line') : graph;
  const oneD = is1D(drawn);
  // another graph: the columns of one sheet
  const [sheet, setSheet] = useState(first);
  const [into, setInto] = useState('');
  const [split, setSplit] = useState<PlotChoice['split']>('one');
  const [merge, setMerge] = useState(true);
  const [yAxes, setYAxes] = useState<YLayout>('one');
  const [xAxes, setXAxes] = useState<XLayout>('one');
  const [style, setStyle] = useState('');
  // a 3D plot of X, Y, Z: one curve, its Z too
  const xyz = XYZ.includes(drawn);
  const type: NodeType = oneD ? 'plot1d' : drawn.endsWith('3d') || xyz ? 'plot3d' : (drawn as NodeType);
  const styles = stylesFor(type);
  const set = (k: number, p: Partial<PlotCurve>) => setCurves((v) => v.map((q, j) => (j === k ? { ...q, ...p } : q)));
  // another curve: from the sheet of the last one, its X, the next column not drawn yet as Y
  const addCurve = () =>
    setCurves((v) => {
      const last = v[v.length - 1];
      const sh = oneD ? (last?.sheet ?? first) : sheet;
      const cols = colsOf(sh).map((c) => c.name);
      const x = last && (!oneD || last.sheet === sh) ? last.x : (curvesByRole(colsOf(sh)).curves[0]?.x ?? cols[0] ?? '');
      const taken = new Set([x, ...v.filter((q) => (q.sheet ?? first) === sh).flatMap((q) => [q.y, q.x, q.yerr])]);
      const from = last ? cols.indexOf(last.y) + 1 : 0;
      const y = [...cols.slice(from), ...cols.slice(0, from)].find((c) => !taken.has(c)) ?? cols[0] ?? '';
      return [...v, { ...(sh ? { sheet: sh } : {}), x, y, yerr: '', xerr: '' }];
    });
  const sheetsUsed = new Set(curves.map((q) => q.sheet ?? ''));
  // a column select of a sheet
  const colSelect = (sh: string | undefined, value: string, onChange: (v: string) => void, none: string) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none}</option>
      {colsOf(sh).map((c) => (
        <option key={c.name} value={c.name}>
          {titleOf(c)}
        </option>
      ))}
    </select>
  );
  const shownCurves = oneD ? curves : curves.map((q) => ({ ...q, sheet }));
  const xRole = oneD ? 'X' : X_ROLE[drawn];
  const ready = curves.length > 0 && (xyz ? !!curves[0].x && !!curves[0].y && !!curves[0].z : curves.every((q) => q.y));
  return (
    <div className="welcome-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="plot-dialog">
        <h3>Plot these columns</h3>
        <div className="hint">
          “{name}”: every curve its {book && oneD ? 'sheet, ' : ''}X, Y and error (filled from the designations of the worksheet; columns named SD, SE, err … are taken as errors). + Curve adds another — {book ? 'from any sheet, ' : ''}any pair of columns.
        </div>
        <div className="row wrap">
          <label className="row" title="How the curves are drawn (a 1D plot), or another graph made of the columns">
            Graph
            <select value={graph} onChange={(e) => (setGraph(e.target.value as GraphKind | 'auto'), setStyle(''))}>
              <optgroup label="1D plot">
                <option value="auto">automatic ({rows <= 60 ? 'lines and symbols' : 'lines'})</option>
                {GRAPHS_1D.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Other graphs (the columns of one sheet)">
                {GRAPHS_OTHER.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </optgroup>
              <optgroup label="3D (the columns of one sheet)">
                {GRAPHS_3D.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {styles.length > 0 && (
            <label className="row" title="A named style of this kind of graph (built in, or saved by you: right-click a node ▸ Save settings as a style)">
              Style
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="">default</option>
                {styles.map((s) => (
                  <option key={`${s.builtin ? 'b' : 'm'}:${s.name}`} value={s.name}>
                    {s.name}
                    {s.builtin ? '' : ' (mine)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!oneD && book && (
            <label className="row" title="The sheet the columns come from">
              Sheet
              <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <table className="plot-cols">
          <thead>
            <tr>
              <th>#</th>
              {book && oneD && <th>Sheet</th>}
              {xRole && <th>{xRole}</th>}
              <th>{drawn === 'histogram' ? 'Values' : drawn === 'boxviolin' ? 'Group' : 'Y'}</th>
              {xyz && <th>Z</th>}
              {(oneD || drawn === 'barchart') && <th>±Y error</th>}
              {oneD && <th>±X error</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {(xyz ? shownCurves.slice(0, 1) : shownCurves).map((q, k) => (
              <tr key={k}>
                <td className="muted">{k + 1}</td>
                {book && oneD && (
                  <td>
                    <select value={q.sheet ?? first} onChange={(e) => set(k, { sheet: e.target.value })}>
                      {sheets.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                {xRole && <td>{oneD || k === 0 ? colSelect(q.sheet, q.x, (x) => (oneD ? set(k, { x }) : setCurves((v) => v.map((w) => ({ ...w, x })))), oneD ? 'row number' : 'automatic') : <span className="muted">as 1</span>}</td>}
                <td>{colSelect(q.sheet, q.y, (y) => set(k, { y }), 'choose')}</td>
                {xyz && <td>{colSelect(q.sheet, q.z ?? '', (z) => set(k, { z }), 'choose')}</td>}
                {(oneD || drawn === 'barchart') && <td>{colSelect(q.sheet, q.yerr, (yerr) => set(k, { yerr }), 'none')}</td>}
                {oneD && <td>{colSelect(q.sheet, q.xerr, (xerr) => set(k, { xerr }), 'none')}</td>}
                <td>
                  <button className="ts-btn" title="Remove this curve" onClick={() => setCurves((v) => v.filter((_, j) => j !== k))}>
                    <X {...IC} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row wrap">
          {!xyz && (
            <button onClick={addCurve} title="Another curve: any X and Y (the next column, then change it)">
              + Curve
            </button>
          )}
          <select
            value=""
            title="The curves the designations of a sheet ask for (X, Y, ±Y of the worksheet)"
            onChange={(e) => {
              const sh = e.target.value;
              if (sh) setCurves((v) => [...v, ...designated(sheetOf(sh === ' ' ? undefined : sh), book ? sh : undefined)]);
            }}
          >
            <option value="">+ Curves from the designations{book ? ' of…' : ''}</option>
            {book ? (
              sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))
            ) : (
              <option value=" ">this dataset</option>
            )}
          </select>
          {curves.length > 0 && <button onClick={() => setCurves([])}>Clear</button>}
        </div>
        {oneD && (
          <div className="row wrap">
            <label className="row" title="A new Plot, or the curves added to a Plot already in the project">
              Into
              <select value={into} onChange={(e) => setInto(e.target.value)}>
                <option value="">a new Plot</option>
                {plots.map(([id, nm]) => (
                  <option key={id} value={id}>
                    add to “{nm}”
                  </option>
                ))}
              </select>
            </label>
            {!into && curves.length > 1 && (
              <label className="row" title="All the curves in one Plot, or a Plot for every sheet, or for every curve">
                Plots
                <select value={split} onChange={(e) => setSplit(e.target.value as PlotChoice['split'])}>
                  <option value="one">one (the same plot)</option>
                  {book && sheetsUsed.size > 1 && <option value="sheet">one per sheet</option>}
                  <option value="curve">one per curve</option>
                </select>
              </label>
            )}
            {!into && split !== 'one' && curves.length > 1 && (
              <label className="row" title="The Plots side by side on one page (a Merge node)">
                <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
                together in a Merge
              </label>
            )}
          </div>
        )}
        {oneD && !into && split !== 'curve' && curves.length > 1 && (
          <div className="row wrap">
            <label className="row" title="Every curve on a Y axis of its own, with its own scale, coloured as the curve (as Origin's double Y and multi-Y)">
              Y axes
              <select value={yAxes} onChange={(e) => setYAxes(e.target.value as YLayout)}>
                {Y_LAYOUTS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="row" title="Every curve on an X axis of its own (curves with different X ranges)">
              X axes
              <select value={xAxes} onChange={(e) => setXAxes(e.target.value as XLayout)}>
                {X_LAYOUTS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="hint">A sweep saved in one long table: cut it into columns first (Split into columns), then plot them.</div>
        <div className="row">
          <button className="btn-run" disabled={!ready} onClick={() => onDone({ graph: drawn, curves: oneD ? curves : shownCurves, ...(sheet ? { sheet } : {}), into: oneD ? into : '', split: into ? 'one' : split === 'sheet' && sheetsUsed.size < 2 ? 'one' : split, merge, style, ...(oneD && !into ? { yAxes, xAxes } : {}) })}>
            {into ? `Add ${curves.length} curve${curves.length === 1 ? '' : 's'}` : `Make the figure (${curves.length} curve${curves.length === 1 ? '' : 's'})`}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
