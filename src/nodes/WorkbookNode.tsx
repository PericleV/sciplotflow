// Workbook: tables typed in or pasted (from a spreadsheet or a text file) on sheets added as
// needed — the same worksheet as Import (select, change cells, designations, copy / paste). Columns and datasets
// connected to A, B, C … go on the first sheet (or the sheet named on their input) and follow the inputs, read-only:
// an empty sheet shows them, a sheet with a table of its own gets them at its right; a sheet name not used makes a new
// sheet. A workbook's sheets come as they are; “Copy into its own sheets” makes them all tables of its own. The columns of
// the inputs can be hidden and moved, and columns of its own added among them.
import { Fragment, useContext, useState } from 'react';
import { NodeOptions } from './NodeOptions.tsx';
import { ExportTable } from './ExportTable.tsx';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter, CSV_DEFAULTS, parseCsv } from '../engine/csv.ts';
import { sheetText, type SheetEdits } from '../engine/sheet.ts';
import type { ColumnRole, Dataset } from '../engine/table.ts';
import { newSheet } from '../defaults.ts';
import type { AppNode, BookLayout, BookSheet, WorkbookData, WorkbookNode } from '../types.ts';
import { Worksheet, type RowLayout, type SheetLayout } from './Worksheet.tsx';
import { Check, Field, InPort, Messages, OutPort, TextInput } from './ui.tsx';
import { blankSheet, type NodeView } from '../engine/evaluate.ts';
import { maxOf } from '../engine/minmax.ts';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ask, notify } from '../ui/dialogStore.ts';
import { NameAliases } from './aliasStore.ts';
import { shownAfterMove, useTabDrag } from './tabDrag.ts';

// A sheet name not used yet: Sheet2, Sheet3 …
const freeName = (sheets: { name: string }[], base = 'Sheet') => {
  let k = sheets.length + 1;
  while (sheets.some((s) => s.name === `${base}${k}`)) k++;
  return `${base}${k}`;
};
// A dataset as a sheet of its own (its designations kept as worksheet changes).
const asSheet = (ds: Dataset, name: string): BookSheet => {
  const roles = Object.fromEntries(ds.columns.flatMap((c, j) => (c.role ? [[j, { role: c.role }]] : [])));
  return { name, text: sheetText(ds), ...(Object.keys(roles).length ? { edits: { cols: roles } } : {}) };
};

// a matrix on an input: how its rows' and columns' names go on the sheet (what it has: names, Y / X, or nothing)
const matrixRows = (are?: string) => (are === 'names' ? 'the rows’ names as the first column' : are === 'Y' ? 'the rows’ Y as the first column' : 'the row numbers as the first column');
const matrixCols = (are?: string) => (are === 'names' ? 'the columns’ names as the names' : are === 'X' ? 'the columns’ X as the names' : 'the columns named C1, C2 …');
type BookIn = NonNullable<NodeView['book']>['ins'][number];
// an input's port by its letter (A: 0, AA: 26)
const portOf = (letter: string) => (/^[A-Z]+$/.test(letter) ? [...letter].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : -1);
// the question asked when a matrix is connected (both ticked to begin with; OK keeps the answer, changed in the options)
function MatrixAsk({ letter, inp, onAnswer }: { letter: string; inp: BookIn; onAnswer: (rows: boolean, cols: boolean) => void }) {
  const [rows, setRows] = useState(true);
  const [cols, setCols] = useState(inp.colsAre !== '');
  return (
    <div className="sheet-convert">
      <span className="hint">
        {letter} · the matrix “{inp.name}” as a table:
      </span>
      <Check label={matrixRows(inp.rowsAre)} value={rows} onChange={setRows} />
      <Check label={matrixCols(inp.colsAre)} value={cols} onChange={setCols} />
      <div className="row">
        <button className="nodrag" onClick={() => onAnswer(rows, cols)}>
          OK
        </button>
      </div>
    </div>
  );
}

export function WorkbookNodeView({ id, data }: NodeProps<WorkbookNode>) {
  const { updateNodeData, setEdges } = useReactFlow<AppNode>();
  const set = (p: Partial<WorkbookData>) => updateNodeData(id, p);
  const r = useNodeResult(id);
  const [renaming, setRenaming] = useState<number | null>(null);
  // its own sheets (a new Workbook's empty Sheet1, left out while only datasets / workbooks come in: none then)
  const own = data.apart && r?.view.book?.own === 0 && data.sheets?.length === 1 && blankSheet(data.sheets[0]) ? [] : (data.sheets ?? []);
  const names = r?.view.sheets ?? own.map((s) => s.name);
  const k = Math.min(names.length - 1, Math.max(0, data.sheet ?? 0));
  // the sheet given on “dataset”: its own, else the one shown (an older node, until another tab is shown)
  const g = Math.min(names.length - 1, Math.max(0, data.give ?? k));
  // (another sheet shown: the one given so far kept on “dataset”)
  const show = (j: number, p: Partial<WorkbookData> = {}) => set({ sheet: j, ...(data.give === undefined ? { give: k } : {}), ...p });
  // the sheet shown comes from the inputs: read-only; its own table with inputs at its right: those columns read-only
  const kinds = r?.view.book?.kinds ?? names.map((_, j) => (j < own.length ? 'own' : 'input'));
  const viewOnly = kinds[k] === 'input';
  const keys = r?.view.book?.keys;
  // the sheets in the order shown (moved with the mouse): its own sheet at a tab (else -1), every tab's id
  const place = r?.view.book?.place;
  const ownIx = (j: number) => {
    const p = place?.[j] ?? j;
    return p < own.length ? p : -1;
  };
  const tabs = useTabDrag((from, to) => {
    const ids = [...(r?.view.book?.ids ?? [])];
    if (ids.length !== names.length) return;
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    set({ order: ids, sheet: shownAfterMove(k, from, to), ...(data.give !== undefined ? { give: shownAfterMove(data.give, from, to) } : {}) });
  });
  // its own sheets with their ids written (a sheet without one: its place until then), before one is added or removed:
  // the others keep theirs
  const stamped = () => own.map((s, j) => (s.id ? s : { ...s, id: `s${j}` }));
  const freeId = (list: BookSheet[]) => {
    let q = list.length;
    while (list.some((s) => s.id === `s${q}`)) q++;
    return `s${q}`;
  };
  // the name a sheet's settings are kept by (an input's sheet renamed upstream since: its old name), and a column's (its key)
  const setName = (j: number) => r?.view.sheetsAs?.[j] ?? names[j];
  const colName = (j: number) => (keys?.[j]?.startsWith('i:') ? keys[j].slice(2) : ds?.columns[j]?.name);
  const aliases = useContext(NameAliases);
  const firstSheet = own[0]?.name || (data.apart ? 'Sheet1' : 'inputs');
  // (the sheet shown: the one given on “dataset”, or another one looked at)
  const ds = r?.view.shownSheet ?? (r?.outputs.out?.t === 'dataset' ? r.outputs.out.v : undefined);
  const conns = useNodeConnections({ handleType: 'target' });
  // one free input after the last one used
  const usedPorts = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, maxOf(usedPorts)) + 2);
  const ins = new Map((r?.view.book?.ins ?? []).map((i) => [i.letter, i]));
  const into = (j: number) => data.into?.[j] ?? '';
  const setInto = (j: number, v: string) => set({ into: Array.from({ length: Math.max(count, j + 1) }, (_, i) => (i === j ? v : into(i))) });
  // a designation on a sheet of the inputs: kept by the sheet's and the column's names (the cells stay read-only)
  const setRole = (sheet: string | undefined, col: string | undefined, role: ColumnRole) => {
    if (!sheet || col === undefined) return;
    set({ roles: { ...data.roles, [sheet]: { ...data.roles?.[sheet], [col]: role } } });
  };
  const setSheet = (j: number, p: Partial<BookSheet>) => set({ sheets: own.map((s, i) => (i === j ? { ...s, ...p } : s)) });
  // the columns of the sheet shown arranged (with inputs): kept by the sheet's name
  const setLayout = (p: Partial<BookLayout>) => {
    const nm = setName(k);
    if (nm !== undefined) set({ layout: { ...data.layout, [nm]: { ...data.layout?.[nm], ...p } } });
  };
  const hiddenKeys = data.layout?.[setName(k) ?? '']?.hide ?? [];
  // the inputs that make the sheet shown, when it is not one of its own (columns, datasets, matrices; not a workbook's
  // sheet): their ports
  const portsOf = (j: number) =>
    ownIx(j) >= 0 ? [] : [...ins.entries()].flatMap(([letter, inp]) => (inp.kind !== 'workbook' && (inp.sheet === names[j] || inp.sheet === setName(j)) ? [portOf(letter)] : []));
  // a column of its own at the place `at` among the inputs' (as many rows as the sheet): an empty sheet showing the
  // inputs starts a table of its own; a sheet of the inputs only gets a sheet of its own of that name, the inputs sent to
  // it (at the same tab, its settings kept)
  const addOwnCol = (at: number) => {
    const nm = names[k];
    const fed = portsOf(k);
    const sh: BookSheet | undefined = own[ownIx(k)] ?? (fed.length && nm !== undefined ? { name: nm, text: '' } : undefined);
    if (!sh || nm === undefined) return;
    const rows = ds ? Math.max(0, maxOf(ds.columns.map((c) => c.values.length))) : 0;
    let edits: SheetEdits;
    let read: number;
    if (kinds[k] === 'input') {
      edits = { addRows: Math.max(1, rows), addCols: 1 };
      read = 0;
    } else {
      const m = r?.view.sheet;
      const e0 = sh.edits ?? {};
      read = (m?.baseCols ?? 0) + (e0.addCols ?? 0);
      const ownRows = m?.rows.length ?? 0;
      edits = { ...e0, addCols: (e0.addCols ?? 0) + 1, ...(rows > ownRows ? { addRows: (e0.addRows ?? 0) + rows - ownRows } : {}) };
    }
    const order = [...(keys ?? [])];
    order.splice(at, 0, `o${read}`);
    if (ownIx(k) >= 0) return set({ sheets: own.map((q, i) => (i === ownIx(k) ? { ...q, edits } : q)), layout: { ...data.layout, [nm]: { ...data.layout?.[nm], order } } });
    const list = stamped();
    const made = { ...sh, id: freeId(list), edits };
    const was = setName(k) ?? nm;
    const tabIds = r?.view.book?.ids ?? [];
    set({
      sheets: [...list, made],
      into: Array.from({ length: Math.max(count, ...fed.map((p) => p + 1)) }, (_, i) => (fed.includes(i) ? nm : into(i))),
      layout: { ...data.layout, [nm]: { ...data.layout?.[was], order } },
      ...(was !== nm && data.roles?.[was] ? { roles: { ...data.roles, [nm]: data.roles[was] } } : {}),
      ...(tabIds.length === names.length ? { order: tabIds.map((q, j) => (j === k ? `${id}:${made.id}` : q)) } : {}),
    });
  };
  const layout: SheetLayout | undefined =
    kinds[k] !== 'own' && keys
      ? {
          keys,
          onOrder: (order) => setLayout({ order }),
          onHide: (ks) => setLayout({ hide: [...new Set([...hiddenKeys, ...ks])] }),
          ...(ownIx(k) >= 0 || portsOf(k).length ? { onAdd: addOwnCol } : {}),
          hidden: hiddenKeys.map((q) => {
            const nm = q.replace(/^i:/, '');
            return aliases.cols?.[nm] ?? nm;
          }),
          onShowAll: () => setLayout({ hide: [] }),
        }
      : undefined;
  // the rows of a sheet of the inputs (read-only): left out, moved, by their places in it (rowsOf: of every row shown)
  const lay = data.layout?.[setName(k) ?? ''];
  const shownRows = r?.view.book?.rowsOf ?? (ds ? Array.from({ length: Math.max(0, maxOf(ds.columns.map((c) => c.values.length))) }, (_, i) => i) : []);
  const rowLayout: RowLayout | undefined =
    kinds[k] === 'input'
      ? {
          onHide: (rows) => setLayout({ rowHide: [...new Set([...(lay?.rowHide ?? []), ...rows.map((q) => shownRows[q]).filter((q) => q !== undefined)])] }),
          onMove: (from, to) => {
            const order = [...shownRows];
            const [q] = order.splice(from, 1);
            order.splice(to, 0, q);
            setLayout({ rowOrder: order });
          },
          hidden: lay?.rowHide?.length ?? 0,
          onShowAll: () => setLayout({ rowHide: undefined }),
        }
      : undefined;
  // (a sheet added: after the others; at the end of the tabs moved)
  const addSheet = (s: BookSheet) => {
    const list = stamped();
    const at = data.order?.length ? names.length : own.length;
    // (the sheet given stays the same one: a place further when the new sheet comes before it)
    const given = data.give ?? k;
    show(at, { sheets: [...list, { ...s, id: freeId(list) }], give: names.length && given >= at ? given + 1 : given });
  };
  // a sheet of its own removed (asked first when it holds a table); one of the inputs taken out of the workbook (the input
  // stays as it is; Show hidden sheets brings it back)
  const removeSheet = async (j: number) => {
    const o = ownIx(j);
    const s = own[o];
    const next = Math.max(0, Math.min(k, names.length - 2));
    // (the sheet given: the same one, one place before when a sheet before it goes; the first when it goes itself)
    const give = data.give === undefined ? {} : { give: j < data.give ? data.give - 1 : j === data.give ? 0 : data.give };
    if (!s) return set({ hideSheets: [...new Set([...(data.hideSheets ?? []), setName(j)])], sheet: next, ...give });
    if ((s.text || s.edits?.cells) && !(await ask(`Remove the sheet “${s.name}” and its table?`, { ok: 'Remove', danger: true }))) return;
    set({ sheets: stamped().filter((_, i) => i !== o), sheet: next, ...give });
  };
  const hiddenSheets = r?.view.book?.hiddenSheets ?? [];
  const rename = (t: number, name: string) => {
    const nm = name.trim();
    const j = ownIx(t);
    setRenaming(null);
    if (j < 0 || !nm || nm === own[j].name) return;
    if (own.some((s, i) => i !== j && s.name === nm)) return notify(`There is already a sheet “${nm}”.`);
    // the designations and the arrangement of the inputs' columns go with the sheet, and the inputs sent to it
    const old = own[j].name;
    const moved = <T,>(rec: Record<string, T> | undefined) => (rec && old in rec ? Object.fromEntries(Object.entries(rec).map(([q, v]) => [q === old ? nm : q, v])) : rec);
    const into = data.into?.some((q) => q.trim() === old) ? data.into.map((q) => (q.trim() === old ? nm : q)) : data.into;
    set({ sheets: own.map((s, i) => (i === j ? { ...s, name: nm } : s)), roles: moved(data.roles), layout: moved(data.layout), into });
  };
  // the table copied to the clipboard (a spreadsheet's cells, or a text file's lines) as a new sheet, its first line the
  // names when it holds text
  const pasteSheet = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return;
      const parsed = parseCsv(t, CSV_DEFAULTS).dataset;
      addSheet(asSheet(parsed, freeName(own)));
    } catch {
      notify('The browser did not allow reading the clipboard: click a cell of the table and press Ctrl+V.');
    }
  };
  // the sheets of the inputs become tables of its own: copied, the connections removed
  const detach = () => {
    const book = r?.outputs.book?.t === 'workbook' ? r.outputs.book.v : undefined;
    if (!book) return;
    // (in the order shown; its own sheets keep their ids, the others get new ones)
    const list = stamped();
    const made: BookSheet[] = [];
    for (const [j, s] of book.sheets.entries()) made.push(kinds[j] === 'own' ? list[ownIx(j)] : { ...asSheet(s, s.name || `Sheet${j + 1}`), id: freeId([...list, ...made]) });
    set({ sheets: made, sheet: k, into: [], roles: undefined, layout: undefined, order: undefined });
    setEdges((es) => es.filter((e) => !(e.target === id && /^in-\d+$/.test(e.targetHandle ?? ''))));
  };
  return (
    <div className="node node-book" style={data.look?.w ? { width: data.look.w } : undefined}>
      {Array.from({ length: count }, (_, j) => {
        const inp = ins.get(columnLetter(j));
        return (
          <InPort key={j} label={columnLetter(j)} port="dataset" id={`in-${j}`} title="Optional: a column, a dataset or a matrix, on the first sheet, or the sheet named in the options (read-only, it follows the input), side by side with the other inputs there; a workbook: its sheets as they are">
            <span className="muted ellipsis grow">{inp ? `${inp.name} · ${inp.kind}${inp.kind !== 'workbook' ? ` → ${inp.sheet || into(j) || firstSheet}` : ''}` : 'connect a column, dataset, workbook or matrix'}</span>
          </InPort>
        );
      })}
      {[...ins.entries()].map(([letter, inp]) => {
        if (inp.kind !== 'matrix' || !inp.ask) return null;
        const port = portOf(letter);
        return <MatrixAsk key={letter} letter={letter} inp={inp} onAnswer={(rows, cols) => set({ matrix: { ...data.matrix, [port]: { rows, cols } } })} />;
      })}
      {r?.outputs.out?.t === 'dataset' && (
        <div className="row">
          <span className="muted ellipsis grow">
            {data.name || 'Book'} · {names.length} sheet{names.length === 1 ? '' : 's'}
          </span>
          <button className="nodrag btn-run plot-btn" title="Plot these columns: every curve its sheet, X, Y and errors, the graph chosen; a figure made and connected beside this node (or curves added to a Plot)" onClick={() => window.dispatchEvent(new CustomEvent('graph-flow:plot', { detail: id }))}>
            Plot…
          </button>
        </div>
      )}
      <NodeOptions>
        <div className="row">
          <Field label="Book name">
            <TextInput value={data.name} placeholder="Book" onChange={(name) => set({ name })} />
          </Field>
        </div>
        <div className="row">
          <button className="nodrag" title="The table copied to the clipboard (cells of a spreadsheet, or the lines of a text file) as a new sheet; its first line gives the names when it holds text" onClick={() => void pasteSheet()}>
            Paste as a new sheet
          </button>
          {kinds.some((t) => t !== 'own') && (
            <button className="nodrag" title="The sheets of the inputs copied into this node (they no longer follow the inputs) and the connections removed: then they can be changed" onClick={detach}>
              Copy into its own sheets
            </button>
          )}
        </div>
        {[...ins.values()].some((i) => i.kind !== 'workbook') && (
          <div className="col-form">
            {Array.from({ length: count }, (_, j) => {
              const inp = ins.get(columnLetter(j));
              return inp && inp.kind !== 'workbook' ? (
                <Fragment key={j}>
                  <span className="ellipsis" title={inp.name}>
                    {columnLetter(j)} · {inp.name} on sheet
                    {inp.kind === 'matrix' && (
                      <>
                        <Check label={matrixRows(inp.rowsAre)} value={data.matrix?.[j]?.rows ?? true} onChange={(rows) => set({ matrix: { ...data.matrix, [j]: { cols: data.matrix?.[j]?.cols ?? true, rows } } })} />
                        <Check label={matrixCols(inp.colsAre)} value={data.matrix?.[j]?.cols ?? true} onChange={(cols) => set({ matrix: { ...data.matrix, [j]: { rows: data.matrix?.[j]?.rows ?? true, cols } } })} />
                      </>
                    )}
                  </span>
                  <TextInput value={into(j)} placeholder={(!into(j) && inp.sheet) || firstSheet} title={`The sheet this input goes to (empty: ${data.apart && inp.kind !== 'column' ? 'a sheet of its own, named after it' : `the first sheet, “${firstSheet}”`}), at the right of its table; inputs given the same sheet go side by side, a name not used yet makes a new sheet`} onChange={(v) => setInto(j, v)} />
                </Fragment>
              ) : null;
            })}
          </div>
        )}
        <ExportTable name={data.name || 'Book'} shown={ds} book={r?.outputs.book?.t === 'workbook' ? r.outputs.book.v : undefined} value={data.export} onChange={(e) => set({ export: e })} />
        <Messages result={r} />
      </NodeOptions>
      {ds && (
        <Worksheet
          key={`${kinds[k] ?? ''}:${names[k] ?? ''}`}
          dataset={ds}
          map={viewOnly ? undefined : r?.view.sheet}
          edits={viewOnly ? undefined : own[ownIx(k)]?.edits}
          onEdits={(e: SheetEdits) => !viewOnly && setSheet(ownIx(k), { edits: e })}
          readOnly={viewOnly}
          layout={layout}
          rowLayout={rowLayout}
          look={data.look}
          onLook={(look) => set({ look })}
          onRole={kinds[k] !== 'own' ? (j, role) => setRole(setName(k), colName(j), role) : undefined}
          formulas={!viewOnly && ownIx(k) >= 0 ? { sheet: names[k] ?? '' } : undefined}
          plain
        />
      )}
      <div className="sheet-tabs nowheel" title="The sheet shown; ▸ marks the one given on the “dataset” output (looking at another one does not change it); double-click a tab of its own to rename it; drag a tab to move the sheet (⇢: the sheet shows the inputs; the sheets made by them are named on their input)">
        {names.map((nm, j) =>
          renaming === j && ownIx(j) >= 0 ? (
            <input
              key={j}
              className="nodrag sheet-rename"
              autoFocus
              defaultValue={nm}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => rename(j, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename(j, e.currentTarget.value);
                if (e.key === 'Escape') setRenaming(null);
                e.stopPropagation();
              }}
            />
          ) : (
            <button key={j} className={`nodrag${j === k ? ' on' : ''}${j === g && names.length > 1 ? ' given' : ''}${tabs.mark(j)}`} onClick={() => show(j)} onDoubleClick={() => ownIx(j) >= 0 && setRenaming(j)} {...tabs.props(j)}>
              {kinds[j] === 'own' ? nm : `⇢ ${nm}`}
              {(names.length > 1 || ownIx(j) < 0) && (
                <span
                  className="sheet-tab-x"
                  title={ownIx(j) >= 0 ? 'Remove this sheet' : 'Take this sheet of the inputs out of the workbook (the input stays as it is; Show hidden sheets brings it back)'}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSheet(j);
                  }}
                >
                  <X {...IC} />
                </span>
              )}
            </button>
          ),
        )}
        <button className="nodrag" title="A new empty sheet (2 columns × 10 rows)" onClick={() => addSheet(newSheet(freeName(names.map((name) => ({ name })))))}>
          +
        </button>
        {hiddenSheets.length > 0 && (
          <button className="nodrag" title={`Taken out: ${hiddenSheets.join(', ')}`} onClick={() => set({ hideSheets: undefined })}>
            Show {hiddenSheets.length} hidden sheet{hiddenSheets.length === 1 ? '' : 's'}
          </button>
        )}
      </div>
      {names.length > 1 && g !== k && (
        <div className="row sheet-give">
          <span className="muted ellipsis">“dataset” gives ▸ {names[g]}</span>
          <button className="nodrag" title="Give the sheet shown on the “dataset” output (to the nodes connected to it)" onClick={() => set({ give: k })}>
            Give this sheet
          </button>
        </div>
      )}
      <Messages result={r} />
      <OutPort label={names[g] ? `dataset (${names[g]})` : 'dataset'} port="dataset" />
      <OutPort label={`workbook (${names.length} sheet${names.length === 1 ? '' : 's'})`} port="workbook" id="book" title="All the sheets, for Extract column (choose the sheet) or Sheets to columns" />
    </div>
  );
}
