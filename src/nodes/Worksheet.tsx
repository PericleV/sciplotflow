// The worksheet of an Import or Workbook node: the table as a spreadsheet. Click a cell to select it (drag, or Shift-click, for a
// block; the column letter or the row number for a whole column or row), double-click, Enter or just type to change
// it (Enter: the cell below, Tab: the next one, Esc: cancel). Ctrl+C copies the selection (Ctrl+Shift+C with the
// names), Ctrl+V pastes a table from a spreadsheet or a text file at the selected cell (rows and columns are added when
// needed), Delete empties it. Right-click (or Ctrl+Shift+= / Ctrl+−): insert, delete and move columns and rows. Every
// column has its designation (X, Y, ±Y …), used by the quick plot. Only the rows in view are drawn, so large files
// scroll at once. The changes are kept apart from the file.
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { columnLetter } from '../engine/csv.ts';
import { editCount, pasteSplitter, type SheetEdits, type SheetMap } from '../engine/sheet.ts';
import { cellText, ROLE_LABELS, roleOf, type ColumnRole, type Dataset } from '../engine/table.ts';
import { maxOf } from '../engine/minmax.ts';
import { X } from 'lucide-react';
import { IC } from './iconProps.ts';

const ROW_H = 21;
const VIEW_H = 300;
const ROLES = Object.entries(ROLE_LABELS) as [ColumnRole, string][];

type Cell = { r: number; c: number } | null;
// a selected block: anchor (where it started) and the other corner
type Sel = { r0: number; c0: number; r1: number; c1: number };
// the right-click menu: where, and on what (a column letter, a row number, a cell)
type Menu = { x: number; y: number; on: 'col' | 'row' | 'cell' };

// A Workbook sheet with inputs: a key per column shown (o<n>: a column of its own table, n its place as read; i:<name>:
// an input's, read-only but for its designation, which can still be left out and moved), the new order of the keys, the
// inputs' columns left out, a column of its own added at a place (absent: none can be added), the inputs' columns hidden
// (their names) and showing them again.
export type SheetLayout = { keys: string[]; onOrder: (keys: string[]) => void; onHide: (keys: string[]) => void; onAdd?: (at: number) => void; hidden?: string[]; onShowAll?: () => void };

// readOnly: a view (Workbook with something connected): select and copy only — but for the designations when onRole is
// given. plain: a table of its own (a Workbook sheet): every cell typed in, so nothing is marked as changed by hand.
// layout: a Workbook sheet with inputs (its own columns editable, as are the rows of its own table).
export function Worksheet({ dataset, map: given, edits, onEdits, readOnly, plain, onRole, layout }: { dataset: Dataset; map?: SheetMap; edits: SheetEdits | undefined; onEdits: (e: SheetEdits) => void; readOnly?: boolean; plain?: boolean; onRole?: (j: number, role: ColumnRole) => void; layout?: SheetLayout }) {
  const nAll = Math.max(0, maxOf(dataset.columns.map((c) => c.values.length)));
  const map: SheetMap = given ?? { rows: Array.from({ length: nAll }, (_, i) => i), cols: dataset.columns.map((_, j) => j), baseRows: nAll, baseCols: dataset.columns.length };
  const [top, setTop] = useState(0);
  const [editing, setEditing] = useState<Cell>(null);
  const [draft, setDraft] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const dragging = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  const e = edits ?? {};
  const cols = dataset.columns;
  const n = Math.max(0, maxOf(cols.map((c) => c.values.length)));
  // every column shown: its place in the table as read (−1: not of its own table — read-only)
  const reads = cols.map((_, c) => {
    if (readOnly) return -1;
    if (!layout) return map.cols[c] ?? -1;
    const m = /^o(\d+)$/.exec(layout.keys[c] ?? '');
    return m ? Number(m[1]) : -1;
  });
  // the rows of its own table (with inputs: those past it are the inputs' only)
  const nOwn = layout ? (given ? Math.min(n, given.rows.length) : 0) : n;
  const lockedCol = (c: number) => reads[c] < 0;
  const locked = (r: number, c: number) => lockedCol(c) || r >= nOwn;
  // a column moved or left out: of its own table, or (with inputs) any
  const canArrange = (c: number) => (layout ? c < layout.keys.length : !lockedCol(c));
  const canAddCol = layout ? !!layout.onAdd : !readOnly;
  const rowsEditable = !readOnly && !layout;
  const first = Math.max(0, Math.floor(top / ROW_H) - 5);
  const last = Math.min(n, Math.ceil((top + VIEW_H) / ROW_H) + 5);
  const key = (r: number, c: number) => `${map.rows[r]}:${reads[c]}`;
  const shown = (r: number, c: number) => (cols[c] && r < cols[c].values.length ? cellText(cols[c], r).replace(/^—$/, '') : '');
  const lo = sel && { r: Math.min(sel.r0, sel.r1), c: Math.min(sel.c0, sel.c1) };
  const hi = sel && { r: Math.max(sel.r0, sel.r1), c: Math.max(sel.c0, sel.c1) };
  const isSel = (r: number, c: number) => !!lo && !!hi && r >= lo.r && r <= hi.r && c >= lo.c && c <= hi.c;
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

  // a column dragged by its letter to another place (the order kept in the edits, by the columns' places as read; with
  // inputs, by the keys)
  const [moving, setMoving] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const moveCol = (from: number, to: number) => {
    if (from === to || to < 0 || to >= cols.length) return;
    if (layout) {
      const order = [...layout.keys];
      const [q] = order.splice(from, 1);
      order.splice(to, 0, q);
      layout.onOrder(order);
    } else {
      const order = [...map.cols];
      const [c] = order.splice(from, 1);
      order.splice(to, 0, c);
      onEdits({ ...e, order });
    }
    setSel(null);
  };
  // the columns a to b left out: those of its own table (deleted), the inputs' (hidden)
  const removeCols = (a: number, b: number) => {
    const list = span(a, b).filter(canArrange);
    const ownCols = list.filter((c) => reads[c] >= 0).map((c) => reads[c]);
    if (ownCols.length) onEdits({ ...e, delCols: [...(e.delCols ?? []), ...ownCols] });
    const inCols = layout ? list.filter((c) => reads[c] < 0).map((c) => layout.keys[c]) : [];
    if (inCols.length) layout?.onHide(inCols);
    setSel(null);
  };
  // an empty column at the place `at` (0 … the number of columns)
  const insertCol = (at: number) => {
    if (layout) return layout.onAdd?.(at);
    if (readOnly) return;
    const order = [...map.cols];
    order.splice(at, 0, map.baseCols + (e.addCols ?? 0));
    onEdits({ ...e, addCols: (e.addCols ?? 0) + 1, order });
    setSel({ r0: 0, c0: at, r1: Math.max(0, n - 1), c1: at });
  };
  const removeRows = (a: number, b: number) => {
    if (!rowsEditable) return;
    onEdits({ ...e, delRows: [...(e.delRows ?? []), ...span(a, Math.min(b, n - 1)).map((r) => map.rows[r])] });
    setSel(null);
  };
  const insertRow = (at: number) => {
    if (!rowsEditable) return;
    const rowOrder = [...map.rows];
    rowOrder.splice(at, 0, map.baseRows + (e.addRows ?? 0));
    onEdits({ ...e, addRows: (e.addRows ?? 0) + 1, rowOrder });
    setSel({ r0: at, c0: 0, r1: at, c1: Math.max(0, cols.length - 1) });
  };
  const wholeCols = !!lo && !!hi && lo.r === 0 && hi.r === n - 1;
  const wholeRows = !!lo && !!hi && lo.c === 0 && hi.c === cols.length - 1 && cols.length > 0;

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);
  // the menu closes on a press or a wheel outside it, or Escape
  useEffect(() => {
    if (!menu) return;
    const close = (ev: Event) => {
      if (!menuBox.current?.contains(ev.target as Node)) setMenu(null);
    };
    const esc = (ev: globalThis.KeyboardEvent) => ev.key === 'Escape' && setMenu(null);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('wheel', close, { passive: true, capture: true });
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const focus = () => box.current?.focus({ preventScroll: true });
  // the row r in view
  const reveal = (r: number) => {
    const el = box.current;
    if (!el) return;
    const head = el.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const y = r * ROW_H;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + ROW_H > el.scrollTop + el.clientHeight - head) el.scrollTop = y + ROW_H - el.clientHeight + head;
  };
  const start = (r: number, c: number, typed?: string) => {
    if (locked(r, c)) return;
    setEditing({ r, c });
    setSel({ r0: r, c0: c, r1: r, c1: c });
    setDraft(typed ?? e.cells?.[key(r, c)] ?? shown(r, c));
  };
  // the next cell that can be changed from (r, c), moving by (dr, dc)
  const next = (r: number, c: number, dr: number, dc: number): [number, number] => {
    const rr = Math.min(nOwn - 1, Math.max(0, r + dr));
    let cc = Math.min(cols.length - 1, Math.max(0, c + dc));
    while (dc && lockedCol(cc) && cc + dc >= 0 && cc + dc < cols.length) cc += dc;
    return lockedCol(cc) ? [rr, c] : [rr, cc];
  };
  const commit = (move?: [number, number]) => {
    if (!editing) return;
    const k = key(editing.r, editing.c);
    const before = e.cells?.[k] ?? shown(editing.r, editing.c);
    if (draft !== before) onEdits({ ...e, cells: { ...e.cells, [k]: draft } });
    if (move) {
      const [r, c] = next(editing.r, editing.c, move[0], move[1]);
      setTimeout(() => start(r, c));
    } else {
      setEditing(null);
      focus();
    }
  };
  const editKeys = (ev: KeyboardEvent) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      ev.preventDefault();
      commit([ev.shiftKey ? -1 : 1, 0]);
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      commit([0, ev.shiftKey ? -1 : 1]);
    } else if (ev.key === 'Escape') {
      setEditing(null);
      focus();
    }
  };
  // the keys of the table when no cell is being changed
  const tableKeys = (ev: KeyboardEvent) => {
    if (editing || !sel) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], PageUp: [-12, 0], PageDown: [12, 0] };
    if (moves[ev.key]) {
      ev.preventDefault();
      ev.stopPropagation();
      const [dr, dc] = moves[ev.key];
      const r = Math.min(n - 1, Math.max(0, (ev.shiftKey ? sel.r1 : sel.r0) + dr));
      const c = Math.min(cols.length - 1, Math.max(0, (ev.shiftKey ? sel.c1 : sel.c0) + dc));
      setSel(ev.shiftKey ? { ...sel, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c });
      reveal(r);
    } else if (ev.key === 'Enter' || ev.key === 'F2') {
      ev.preventDefault();
      ev.stopPropagation();
      start(sel.r0, sel.c0);
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      ev.stopPropagation();
      clear();
    } else if (ev.key === 'Escape') {
      ev.stopPropagation();
      setSel(null);
    } else if (mod && (ev.key === '-' || ev.key === '_') && lo && hi) {
      // the whole columns or rows selected left out
      ev.preventDefault();
      ev.stopPropagation();
      if (wholeCols) removeCols(lo.c, hi.c);
      else if (wholeRows) removeRows(lo.r, hi.r);
    } else if (mod && ev.shiftKey && (ev.key === '+' || ev.key === '=') && lo) {
      // an empty column (row) before the whole column (row) selected
      ev.preventDefault();
      ev.stopPropagation();
      if (wholeCols) insertCol(lo.c);
      else if (wholeRows) insertRow(lo.r);
    } else if (mod && ev.key.toLowerCase() === 'a') {
      ev.preventDefault();
      ev.stopPropagation();
      setSel({ r0: 0, c0: 0, r1: n - 1, c1: cols.length - 1 });
    } else if (!mod && !ev.altKey && ev.key.length === 1) {
      // typing over the selected cell
      ev.preventDefault();
      ev.stopPropagation();
      start(sel.r0, sel.c0, ev.key);
    } else if (mod && ev.key.toLowerCase() === 'c') {
      // the copy event follows; remember whether the names are wanted
      withHeader.current = ev.shiftKey;
      ev.stopPropagation();
    } else if (mod && ev.key.toLowerCase() === 'v') ev.stopPropagation();
  };
  const withHeader = useRef(false);
  const clear = () => {
    if (!lo || !hi) return;
    const cells = { ...e.cells };
    let any = false;
    for (let r = lo.r; r <= hi.r; r++)
      for (let c = lo.c; c <= hi.c; c++)
        if (!locked(r, c) && (shown(r, c) !== '' || cells[key(r, c)] !== undefined)) {
          cells[key(r, c)] = '';
          any = true;
        }
    if (any) onEdits({ ...e, cells });
  };
  const onCopy = (ev: ClipboardEvent) => {
    if (editing || !lo || !hi) return;
    const lines: string[] = [];
    const cs = span(lo.c, hi.c);
    if (withHeader.current) lines.push(cs.map((c) => cols[c].name).join('\t'));
    for (let r = lo.r; r <= hi.r; r++) lines.push(cs.map((c) => shown(r, c)).join('\t'));
    ev.clipboardData.setData('text/plain', lines.join('\n'));
    ev.preventDefault();
    withHeader.current = false;
  };
  // a table pasted at the selected cell (tabs between the cells, as spreadsheets copy them); with inputs, not over their
  // columns (the columns past the last are new ones of its own)
  const onPaste = (ev: ClipboardEvent) => {
    if (editing || readOnly) return;
    const text = ev.clipboardData.getData('text/plain');
    if (!text) return;
    ev.preventDefault();
    const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
    const table = rows.map(pasteSplitter(rows));
    const width = maxOf(table.map((t) => t.length));
    const r0 = lo?.r ?? 0;
    const c0 = lo?.c ?? 0;
    if (table.length * width > 2_000_000 && !confirm(`Paste ${(table.length * width).toLocaleString('en')} cells? (kept in the project as typed cells)`)) return;
    // rows and columns added when the table goes past the last
    const moreRows = Math.max(0, r0 + table.length - nOwn);
    const moreCols = Math.max(0, c0 + width - cols.length);
    const rowAt = (r: number) => (r < nOwn ? map.rows[r] : map.baseRows + (e.addRows ?? 0) + (r - nOwn));
    const colAt = (c: number) => (c < cols.length ? reads[c] : map.baseCols + (e.addCols ?? 0) + (c - cols.length));
    const cells = { ...e.cells };
    table.forEach((t, i) =>
      t.forEach((v, j) => {
        const c = colAt(c0 + j);
        if (c >= 0) cells[`${rowAt(r0 + i)}:${c}`] = v.trim();
      }),
    );
    onEdits({ ...e, cells, ...(moreRows ? { addRows: (e.addRows ?? 0) + moreRows } : {}), ...(moreCols ? { addCols: (e.addCols ?? 0) + moreCols } : {}) });
    // the new columns of its own after the inputs' (where they were pasted)
    if (layout && moreCols) layout.onOrder([...layout.keys, ...span(1, moreCols).map((k) => `o${map.baseCols + (e.addCols ?? 0) + k - 1}`)]);
    setSel({ r0, c0, r1: r0 + table.length - 1, c1: c0 + width - 1 });
  };
  // a name typed replaces the unit of an older project (it is already shown in the name)
  const setHead = (c: number, p: { name?: string; role?: ColumnRole }) => {
    const at = reads[c];
    const { unit: _u, comment: _c, ...prev } = e.cols?.[at] ?? {};
    onEdits({ ...e, cols: { ...e.cols, [at]: { ...(p.name !== undefined ? prev : (e.cols?.[at] ?? {})), ...p } } });
  };
  const edited = (r: number, c: number) => !plain && (e.cells?.[key(r, c)] !== undefined || map.rows[r] >= map.baseRows || reads[c] >= map.baseCols);
  const count = plain ? 0 : editCount(e);
  const selCols = (c: number, shift: boolean) => {
    setSel(shift && sel ? { r0: 0, c0: sel.c0, r1: n - 1, c1: c } : { r0: 0, c0: c, r1: n - 1, c1: c });
    focus();
  };
  const selRows = (r: number, shift: boolean) => {
    setSel(shift && sel ? { r0: sel.r0, c0: 0, r1: r, c1: cols.length - 1 } : { r0: r, c0: 0, r1: r, c1: cols.length - 1 });
    focus();
  };
  // right-click: on the selection it keeps it, else selects what was clicked (the column, the row, the cell)
  const openMenu = (ev: ReactMouseEvent, on: Menu['on'], r: number, c: number) => {
    ev.preventDefault();
    ev.stopPropagation();
    const inside = on === 'col' ? !!lo && !!hi && wholeCols && c >= lo.c && c <= hi.c : on === 'row' ? !!lo && !!hi && wholeRows && r >= lo.r && r <= hi.r : isSel(r, c);
    if (!inside) setSel(on === 'col' ? { r0: 0, c0: c, r1: n - 1, c1: c } : on === 'row' ? { r0: r, c0: 0, r1: r, c1: cols.length - 1 } : { r0: r, c0: c, r1: r, c1: c });
    setMenu({ x: ev.clientX, y: ev.clientY, on });
    focus();
  };
  const selText = lo && hi && (hi.r > lo.r || hi.c > lo.c) ? `${hi.r - lo.r + 1} × ${hi.c - lo.c + 1} selected` : '';

  // the entries of the menu for the selection (columns: when a column or a cell was clicked; rows: a row or a cell)
  const items: { label: string; run: () => void; danger?: boolean; kbd?: string }[] = [];
  if (menu && lo && hi) {
    const nc = hi.c - lo.c + 1;
    const nr = hi.r - lo.r + 1;
    if (menu.on !== 'row') {
      if (canAddCol) items.push({ label: 'Insert column left', run: () => insertCol(lo.c), kbd: menu.on === 'col' ? 'Ctrl+Shift+=' : undefined }, { label: 'Insert column right', run: () => insertCol(hi.c + 1) });
      if (nc === 1 && canArrange(lo.c)) {
        if (lo.c > 0) items.push({ label: 'Move column left', run: () => moveCol(lo.c, lo.c - 1) });
        if (lo.c < cols.length - 1) items.push({ label: 'Move column right', run: () => moveCol(lo.c, lo.c + 1) });
      }
      const gone = span(lo.c, hi.c).filter(canArrange);
      if (gone.length) {
        const hides = gone.every(lockedCol);
        items.push({ label: `${hides ? 'Hide' : 'Delete'} ${gone.length === 1 ? 'column' : `${gone.length} columns`}`, run: () => removeCols(lo.c, hi.c), danger: true, kbd: menu.on === 'col' ? 'Ctrl+−' : undefined });
      }
    }
    if (menu.on !== 'col' && rowsEditable) {
      items.push({ label: 'Insert row above', run: () => insertRow(lo.r), kbd: menu.on === 'row' ? 'Ctrl+Shift+=' : undefined }, { label: 'Insert row below', run: () => insertRow(Math.min(n, hi.r + 1)) });
      items.push({ label: `Delete ${nr === 1 ? 'row' : `${nr} rows`}`, run: () => removeRows(lo.r, hi.r), danger: true, kbd: menu.on === 'row' ? 'Ctrl+−' : undefined });
    }
  }

  return (
    <div className="worksheet">
      <div ref={box} tabIndex={0} className="sheet-scroll nowheel nodrag nokey" style={{ maxHeight: VIEW_H + 5 * ROW_H + 8 }} onScroll={(ev) => setTop(ev.currentTarget.scrollTop)} onKeyDown={tableKeys} onCopy={onCopy} onPaste={onPaste}>
        <table>
          <thead>
            <tr>
              <th className="rowhead" title="Click a column letter: the whole column (Shift: several); a row number: the whole row. Right-click: insert, delete, move">
                #
              </th>
              {cols.map((_c, j) => (
                <th
                  key={j}
                  className={`col-letter${lo && hi && j >= lo.c && j <= hi.c && lo.r === 0 && hi.r === n - 1 ? ' sel' : ''}${dropAt === j && moving !== null && moving !== j ? (moving < j ? ' drop-after' : ' drop-before') : ''}`}
                  title={canArrange(j) ? 'Select the whole column (Shift: up to this one); drag it to move the column; right-click: insert, delete, move' : 'Select the whole column (Shift: up to this one)'}
                  onClick={(ev) => selCols(j, ev.shiftKey)}
                  onContextMenu={(ev) => openMenu(ev, 'col', 0, j)}
                  draggable={canArrange(j)}
                  onDragStart={(ev) => {
                    ev.dataTransfer.effectAllowed = 'move';
                    ev.dataTransfer.setData('text/plain', String(j));
                    setMoving(j);
                  }}
                  onDragOver={(ev) => {
                    if (moving === null || !canArrange(j)) return;
                    ev.preventDefault();
                    setDropAt(j);
                  }}
                  onDragEnd={() => {
                    setMoving(null);
                    setDropAt(null);
                  }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    if (moving !== null && canArrange(j)) moveCol(moving, j);
                    setMoving(null);
                    setDropAt(null);
                  }}
                >
                  {columnLetter(j)}({ROLE_LABELS[roleOf(cols, j)]})
                  {canArrange(j) && (
                    <button
                      className="sheet-x"
                      title={lockedCol(j) ? 'Hide this column of the inputs (it comes back from the foot of the table)' : 'Leave this column out'}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeCols(j, j);
                      }}
                    >
                      <X {...IC} />
                    </button>
                  )}
                </th>
              ))}
            </tr>
            <tr className="head-role">
              <th className="rowhead" title="What a quick plot does with the column (its designation): each Y with the nearest X on its left, a ±Y with the Y on its left; – (none): left out">
                plot as
              </th>
              {cols.map((_c, j) => (
                <th key={j}>
                  <select className={`nodrag${!plain && !lockedCol(j) && e.cols?.[reads[j]]?.role ? ' edited' : ''}`} disabled={lockedCol(j) && !onRole} value={roleOf(cols, j)} onChange={(ev) => (lockedCol(j) && onRole ? onRole(j, ev.target.value as ColumnRole) : setHead(j, { role: ev.target.value as ColumnRole }))}>
                    {ROLES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
            <tr className="head-name">
              <th className="rowhead">name</th>
              {cols.map((c, j) => (
                <th key={j}>
                  <input className={!plain && !lockedCol(j) && e.cols?.[reads[j]]?.name !== undefined ? 'edited' : ''} value={c.name} placeholder={columnLetter(j)} spellCheck={false} readOnly={lockedCol(j)} title="The name of the column, with its unit if it has one: “Wavelength (nm)”" onChange={(ev) => setHead(j, { name: ev.target.value })} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {first > 0 && (
              <tr style={{ height: first * ROW_H }}>
                <td colSpan={cols.length + 1} />
              </tr>
            )}
            {Array.from({ length: last - first }, (_, k) => first + k).map((r) => (
              <tr key={r} style={{ height: ROW_H }}>
                <td className="rowhead" title={rowsEditable ? 'Select the whole row (Shift: up to this one); right-click: insert, delete' : 'Select the whole row (Shift: up to this one)'} onClick={(ev) => selRows(r, ev.shiftKey)} onContextMenu={(ev) => openMenu(ev, 'row', r, 0)}>
                  {r + 1}
                  {rowsEditable && (
                    <button
                      className="sheet-x"
                      title="Leave this row out"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeRows(r, r);
                      }}
                    >
                      <X {...IC} />
                    </button>
                  )}
                </td>
                {cols.map((_c, j) =>
                  editing && editing.r === r && editing.c === j ? (
                    <td key={j} className="editing">
                      <input autoFocus value={draft} spellCheck={false} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => commit()} onKeyDown={editKeys} />
                    </td>
                  ) : (
                    <td
                      key={j}
                      className={`${!locked(r, j) && edited(r, j) ? 'edited' : ''}${isSel(r, j) ? ' sel' : ''}`}
                      onMouseDown={(ev) => {
                        if (ev.button !== 0) return;
                        dragging.current = true;
                        setSel(ev.shiftKey && sel ? { ...sel, r1: r, c1: j } : { r0: r, c0: j, r1: r, c1: j });
                        focus();
                        ev.preventDefault();
                      }}
                      onMouseEnter={() => dragging.current && sel && setSel({ ...sel, r1: r, c1: j })}
                      onDoubleClick={() => start(r, j)}
                      onContextMenu={(ev) => openMenu(ev, 'cell', r, j)}
                    >
                      {shown(r, j)}
                    </td>
                  ),
                )}
              </tr>
            ))}
            {last < n && (
              <tr style={{ height: (n - last) * ROW_H }}>
                <td colSpan={cols.length + 1} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="row wrap sheet-foot">
        {rowsEditable || (layout && !readOnly) ? (
          <>
            <button className="nodrag" onClick={() => onEdits({ ...e, addRows: (e.addRows ?? 0) + 1 })}>
              + Row
            </button>
            <button className="nodrag" onClick={() => onEdits({ ...e, addRows: (e.addRows ?? 0) + 10 })}>
              + 10 rows
            </button>
          </>
        ) : null}
        {canAddCol && (
          <button className="nodrag" onClick={() => (layout ? layout.onAdd?.(cols.length) : onEdits({ ...e, addCols: (e.addCols ?? 0) + 1 }))}>
            + Column
          </button>
        )}
        <span className="hint" title="Double-click, Enter or type to change a cell; Ctrl+C / Ctrl+V copy and paste (Ctrl+Shift+C: with the names); Delete empties the selection; right-click: insert, delete, move columns and rows">
          {n} rows × {cols.length} columns
          {selText && ` · ${selText}`}
          {count > 0 && ` · ${count} change${count > 1 ? 's' : ''} by hand (marked)`}
        </span>
        {!!layout?.hidden?.length && (
          <button className="nodrag" title={`Hidden: ${layout.hidden.join(', ')}`} onClick={layout.onShowAll}>
            Show {layout.hidden.length} hidden
          </button>
        )}
        {count > 0 && (
          <button className="nodrag danger" onClick={() => confirm('Undo every change made by hand in this table (the file stays as it is)?') && onEdits({})}>
            Undo all changes
          </button>
        )}
      </div>
      {menu &&
        items.length > 0 &&
        createPortal(
          <div className="ctx-menu" ref={menuBox} style={{ left: Math.max(4, Math.min(menu.x, window.innerWidth - 224)), top: Math.max(4, Math.min(menu.y, window.innerHeight - 40 - 30 * items.length)) }} onContextMenu={(ev) => ev.preventDefault()}>
            {items.map((it) => (
              <button
                key={it.label}
                className={it.danger ? 'danger' : ''}
                onClick={() => {
                  it.run();
                  setMenu(null);
                  focus();
                }}
              >
                {it.label} {it.kbd && <span className="kbd">{it.kbd}</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
