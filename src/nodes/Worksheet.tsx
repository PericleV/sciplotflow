// The worksheet of an Import or Workbook node: the table as a spreadsheet. Click a cell to select it (drag, or Shift-click, for a
// block; the column letter or the row number for a whole column or row), double-click, Enter or just type to change
// it (Enter: the cell below, Tab: the next one, Esc: cancel). Ctrl+C copies the selection (Ctrl+Shift+C with the
// names), Ctrl+V pastes a table from a spreadsheet or a text file at the selected cell (rows and columns are added when
// needed), Delete empties it. Right-click (or Ctrl+Shift+= / Ctrl+−): insert, delete and move columns and rows. Every
// column has its designation (X, Y, ±Y …), used by the quick plot. Only the rows in view are drawn, so large files
// scroll at once. The changes are kept apart from the file.
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { columnLetter } from '../engine/csv.ts';
import { convertInSheet, editCount, fillSeries, pasteSplitter, type SheetEdits, type SheetLook, type SheetMap } from '../engine/sheet.ts';
import { cellText, ROLE_LABELS, roleOf, type ColumnRole, type Dataset } from '../engine/table.ts';
import { maxOf } from '../engine/minmax.ts';
import { Lock, X } from 'lucide-react';
import { formulaOfKept, type ColFormula } from '../engine/sheetFormula.ts';
import { FormulaWindow } from './FormulaWindow.tsx';
import { IC } from './iconProps.ts';
import { ask } from '../ui/dialogStore.ts';
import { looksNumeric } from '../engine/convert.ts';
import { ConvertPanel, ConvertProposal } from './SheetConvert.tsx';

const ROW_H = 21;
const VIEW_H = 300;
// the widths a column is dragged to, the rows' height, the table's least size
const COL_MIN = 36;
const COL_MAX = 600;
const ROW_MIN = 16;
const ROW_MAX = 80;
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
// the rows of a Workbook sheet of the inputs (read-only): left out and moved by their places shown (hidden: how many)
export type RowLayout = { onHide: (rows: number[]) => void; onMove: (from: number, to: number) => void; hidden: number; onShowAll: () => void };

// readOnly: a view (Workbook with something connected): select and copy only — but for the designations when onRole is
// given. plain: a table of its own (a Workbook sheet): every cell typed in, so nothing is marked as changed by hand.
// layout: a Workbook sheet with inputs (its own columns editable, as are the rows of its own table).
// look / onLook: how it is drawn (the node's width, the table's height, the rows' height, the columns' widths), changed by
// dragging the table's corner, the border under a row number, the border right of a column letter (double-click: the
// column fits its values)
// formulas: its own columns can be given by a formula (a Workbook: Set column values), on the sheet of that name
export function Worksheet({ dataset, map: given, edits, onEdits, readOnly, plain, onRole, layout, rowLayout, look, onLook, formulas }: { dataset: Dataset; map?: SheetMap; edits: SheetEdits | undefined; onEdits: (e: SheetEdits) => void; readOnly?: boolean; plain?: boolean; rowLayout?: RowLayout; onRole?: (j: number, role: ColumnRole) => void; layout?: SheetLayout; look?: SheetLook; onLook?: (l: SheetLook) => void; formulas?: { sheet: string } }) {
  // (while a border or the corner is dragged: the look shown, kept when the mouse is let go)
  const [live, setLive] = useState<SheetLook | null>(null);
  const lk = live ?? look ?? {};
  const rowH = lk.rowH ?? ROW_H;
  const viewH = lk.h ?? VIEW_H + 5 * ROW_H + 8;
  const colW = (name: string) => lk.cols?.[name];
  // a column's own width on its cells (else the table's)
  const wide = (j: number) => {
    const w = colW(dataset.columns[j]?.name ?? '');
    return w ? { width: w, minWidth: w, maxWidth: w } : undefined;
  };
  const nAll = Math.max(0, maxOf(dataset.columns.map((c) => c.values.length)));
  const map: SheetMap = given ?? { rows: Array.from({ length: nAll }, (_, i) => i), cols: dataset.columns.map((_, j) => j), baseRows: nAll, baseCols: dataset.columns.length };
  const [top, setTop] = useState(0);
  const [editing, setEditing] = useState<Cell>(null);
  // a column's name being typed (its place, the text): shown as typed, not as the table read before it, which comes back
  // a moment later (the cursor would jump to the end and the letters land elsewhere)
  const [nameDraft, setNameDraft] = useState<{ j: number; v: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [sel, setSel] = useState<Sel | null>(null);
  // whole columns or rows picked one by one (Ctrl + click on their letters or numbers): not side by side, unlike `sel`
  const [picks, setPicks] = useState<{ on: 'col' | 'row'; list: number[] } | null>(null);
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
  // a column of its own locked by hand (right-click its letter): its name and values kept, not deleted (moved: yes)
  const userLocked = (c: number) => reads[c] >= 0 && !!e.locked?.includes(reads[c]);
  // a column of its own given by a formula (Set column values): its cells not typed in
  const formulaOf = (c: number): ColFormula | undefined => (formulas && reads[c] >= 0 ? e.formulas?.[reads[c]] : undefined);
  // every column's key, as the formulas name them (o<n>: of its own table; with inputs, the layout's)
  const colKeys = cols.map((_, c) => (layout ? (layout.keys[c] ?? `#${c}`) : reads[c] >= 0 ? `o${reads[c]}` : `#${c}`));
  // the column whose formula is being written (its place as read)
  const [fxFor, setFxFor] = useState<number | null>(null);
  // its own columns whose text looks like numbers: proposed under the table (converted when asked: conv, the columns)
  const proposed = cols.flatMap((c, j) => {
    if (reads[j] < 0 || !c.text) return [];
    const l = looksNumeric(c);
    return l.numeric > 0 && 2 * l.numeric >= l.text ? [{ c: j, examples: l.examples }] : [];
  });
  const [conv, setConv] = useState<number[] | null>(null);
  const [later, setLater] = useState(false);
  const locked = (r: number, c: number) => lockedCol(c) || userLocked(c) || !!formulaOf(c) || r >= nOwn;
  // a column moved or left out: of its own table, or (with inputs) any
  const canArrange = (c: number) => (layout ? c < layout.keys.length : !lockedCol(c));
  const canRemove = (c: number) => canArrange(c) && !userLocked(c);
  // a change asked of a locked column (or one given by a formula): said under the table for a moment
  const [lockNote, setLockNote] = useState<false | 'lock' | 'formula'>(false);
  const noteLocked = (why: 'lock' | 'formula' = 'lock') => {
    setLockNote(why);
    window.setTimeout(() => setLockNote(false), 2500);
  };
  // the columns of its own chosen locked, or all unlocked when they all are
  const toggleLock = (cs: number[]) => {
    const own = cs.filter((c) => reads[c] >= 0).map((c) => reads[c]);
    if (!own.length) return;
    const all = own.every((q) => e.locked?.includes(q));
    const next = all ? (e.locked ?? []).filter((q) => !own.includes(q)) : [...new Set([...(e.locked ?? []), ...own])];
    onEdits({ ...e, locked: next.length ? next : undefined });
  };
  const canAddCol = layout ? !!layout.onAdd : !readOnly;
  const rowsEditable = !readOnly && !layout;
  // the rows that can be left out: any (a table of its own), or those of its own table (with inputs)
  const rowGone = (r: number) => (!!rowLayout && r < n) || (!readOnly && (rowsEditable || (!!layout && r < nOwn)));
  const first = Math.max(0, Math.floor(top / rowH) - 5);
  const last = Math.min(n, Math.ceil((top + viewH) / rowH) + 5);
  const key = (r: number, c: number) => `${map.rows[r]}:${reads[c]}`;
  const shown = (r: number, c: number) => (cols[c] && r < cols[c].values.length ? cellText(cols[c], r).replace(/^—$/, '') : '');
  const lo = sel && { r: Math.min(sel.r0, sel.r1), c: Math.min(sel.c0, sel.c1) };
  const hi = sel && { r: Math.max(sel.r0, sel.r1), c: Math.max(sel.c0, sel.c1) };
  const isSel = (r: number, c: number) => (picks ? picks.list.includes(picks.on === 'col' ? c : r) : !!lo && !!hi && r >= lo.r && r <= hi.r && c >= lo.c && c <= hi.c);
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
  // the columns listed left out: those of its own table (deleted), the inputs' (hidden)
  const removeCols = (cs: number[]) => {
    if (cs.some(userLocked)) noteLocked();
    const list = cs.filter(canRemove);
    const ownCols = list.filter((c) => reads[c] >= 0).map((c) => reads[c]);
    if (ownCols.length) onEdits({ ...e, delCols: [...(e.delCols ?? []), ...ownCols] });
    const inCols = layout ? list.filter((c) => reads[c] < 0).map((c) => layout.keys[c]) : [];
    if (inCols.length) layout?.onHide(inCols);
    setSel(null);
    setPicks(null);
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
  // a column right of the one chosen, its formula window open (its place as read: the next new one)
  const insertFormulaCol = (at: number) => {
    const place = layout ? (given ? given.baseCols + (e.addCols ?? 0) : 0) : map.baseCols + (e.addCols ?? 0);
    insertCol(at);
    setFxFor(place);
  };
  // a column's values written in its cells, as typed (Once, or a formula taken off), its formula not kept
  const writeOnce = (place: number, values: Float64Array) => {
    const cells = { ...e.cells };
    const rowAt = (r: number) => (r < nOwn ? map.rows[r] : map.baseRows + (e.addRows ?? 0) + (r - nOwn));
    for (let r = 0; r < values.length; r++) cells[`${rowAt(r)}:${place}`] = Number.isFinite(values[r]) ? String(+values[r].toPrecision(15)) : '';
    const more = Math.max(0, values.length - nOwn);
    const { [place]: _gone, ...rest } = e.formulas ?? {};
    onEdits({ ...e, cells, formulas: Object.keys(rest).length ? rest : undefined, ...(more ? { addRows: (e.addRows ?? 0) + more } : {}) });
  };
  const removeRows = (rs: number[]) => {
    const list = rs.filter((r) => r < n && rowGone(r));
    if (rowLayout) {
      if (list.length) rowLayout.onHide(list);
      setSel(null);
      setPicks(null);
      return;
    }
    if (list.length) onEdits({ ...e, delRows: [...(e.delRows ?? []), ...list.map((r) => map.rows[r])] });
    setSel(null);
    setPicks(null);
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
  // the whole columns (rows) chosen: picked one by one, or a block of them
  const chosenCols = picks?.on === 'col' ? picks.list : !picks && wholeCols && lo && hi ? span(lo.c, hi.c) : [];
  const chosenRows = picks?.on === 'row' ? picks.list : !picks && wholeRows && lo && hi ? span(lo.r, hi.r) : [];
  const goneCols = chosenCols.filter(canRemove);
  const goneRows = chosenRows.filter(rowGone);

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
  // a border or the corner dragged: the look followed live (f: from the move, in pixels of the canvas), kept at the end
  const dragLook = (ev: ReactPointerEvent, f: (dx: number, dy: number) => SheetLook, live?: (l: SheetLook) => void) => {
    if (!onLook || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    const el = box.current;
    // (the canvas's zoom: screen pixels to the table's)
    const zoom = el && el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
    const [x0, y0] = [ev.clientX, ev.clientY];
    let cur: SheetLook | null = null;
    const move = (e: PointerEvent) => {
      cur = f((e.clientX - x0) / zoom, (e.clientY - y0) / zoom);
      setLive(cur);
      live?.(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLive(null);
      if (cur) onLook(cur);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
  // ---- the fill handle: the selection's corner dragged down, up, right or left goes on from its cells (fillSeries) ----
  const [fillTo, setFillTo] = useState<{ r: number; c: number } | null>(null);
  // the cells a fill to `t` writes: down / up (each column goes on) or right / left (each row), the larger way
  const fillRange = (t: { r: number; c: number }) => {
    if (!lo || !hi) return null;
    const dr = t.r > hi.r ? t.r - hi.r : t.r < lo.r ? t.r - lo.r : 0;
    const dc = t.c > hi.c ? t.c - hi.c : t.c < lo.c ? t.c - lo.c : 0;
    if (!dr && !dc) return null;
    return Math.abs(dr) >= Math.abs(dc) ? { rows: dr > 0 ? span(hi.r + 1, t.r) : span(t.r, lo.r - 1), cols: span(lo.c, hi.c), down: dr > 0, vertical: true } : { rows: span(lo.r, hi.r), cols: dc > 0 ? span(hi.c + 1, t.c) : span(t.c, lo.c - 1), down: dc > 0, vertical: false };
  };
  const doFill = (t: { r: number; c: number }, more: boolean) => {
    const f = fillRange(t);
    if (!f || !lo || !hi) return;
    const cells = { ...e.cells };
    const lines = f.vertical ? f.cols : f.rows;
    for (const line of lines) {
      const src = f.vertical ? span(lo.r, hi.r).map((r) => shown(r, line)) : span(lo.c, hi.c).map((c) => shown(line, c));
      const n2 = f.vertical ? f.rows.length : f.cols.length;
      // (up or left: going on backwards from the first cell)
      const vals = f.down ? fillSeries(src, n2, more) : fillSeries([...src].reverse(), n2, more).reverse();
      vals.forEach((v, k) => {
        const [r, c] = f.vertical ? [f.rows[k], line] : [line, f.cols[k]];
        if (!locked(r, c)) cells[key(r, c)] = v;
      });
    }
    onEdits({ ...e, cells });
    setSel({ r0: Math.min(lo.r, ...f.rows), c0: Math.min(lo.c, ...f.cols), r1: Math.max(hi.r, ...f.rows), c1: Math.max(hi.c, ...f.cols) });
  };
  const startFill = (ev: ReactPointerEvent) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    let t: { r: number; c: number } | null = null;
    const move = (m: PointerEvent) => {
      const td = document.elementFromPoint(m.clientX, m.clientY)?.closest('td[data-r]') as HTMLElement | null;
      if (!td) return;
      t = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
      setFillTo(t);
    };
    const up = (u: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setFillTo(null);
      if (t) doFill(t, u.ctrlKey || u.metaKey);
      focus();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  // a double-click on the handle: down as far as the column beside it (left, else right) has values
  const fillDown = (ev: ReactMouseEvent) => {
    ev.stopPropagation();
    if (!lo || !hi) return;
    const adj = lo.c > 0 ? lo.c - 1 : hi.c + 1;
    let end = hi.r;
    while (end + 1 < n && adj < cols.length && shown(end + 1, adj) !== '') end++;
    if (end > hi.r) doFill({ r: end, c: hi.c }, ev.ctrlKey || ev.metaKey);
  };
  const preview = fillTo ? fillRange(fillTo) : null;
  const inFill = (r: number, c: number) => !!preview && preview.rows.includes(r) && preview.cols.includes(c);
  const showHandle = !readOnly && !editing && !picks && !!lo && !!hi;
  const base = look ?? {};
  const dragCol = (ev: ReactPointerEvent, j: number) => {
    const th = (ev.currentTarget as HTMLElement).closest('th');
    const w0 = colW(cols[j].name) ?? th?.offsetWidth ?? 92;
    dragLook(ev, (dx) => ({ ...base, cols: { ...base.cols, [cols[j].name]: clamp(w0 + dx, COL_MIN, COL_MAX) } }));
  };
  const dragRow = (ev: ReactPointerEvent) => {
    const h0 = rowH;
    dragLook(ev, (_dx, dy) => ({ ...base, rowH: clamp(h0 + dy, ROW_MIN, ROW_MAX) }));
  };
  // the corner: the node as wide, the table as high (the node's width shown live on it)
  const dragCorner = (ev: ReactPointerEvent) => {
    const node = box.current?.closest('.node') as HTMLElement | null;
    const [w0, h0] = [node?.offsetWidth ?? 400, box.current?.offsetHeight ?? viewH];
    dragLook(
      ev,
      (dx, dy) => ({ ...base, w: clamp(w0 + dx, 260, 2400), h: clamp(h0 + dy, 90, 2400) }),
      (l) => node && l.w && (node.style.width = `${l.w}px`),
    );
  };
  // a column fitted to its name and values (the first thousand rows), on a double-click of its border
  const fitCol = (j: number) => {
    if (!onLook) return;
    const g = document.createElement('canvas').getContext('2d');
    if (!g) return;
    g.font = getComputedStyle(box.current ?? document.body).font;
    const c = cols[j];
    let m = g.measureText(c.name).width + 12;
    for (let r = 0; r < Math.min(n, 1000); r++) m = Math.max(m, g.measureText(shown(r, j)).width + 12);
    onLook({ ...base, cols: { ...base.cols, [c.name]: clamp(m, COL_MIN, COL_MAX) } });
  };
  // the row r in view
  const reveal = (r: number) => {
    const el = box.current;
    if (!el) return;
    const head = el.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const y = r * rowH;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + rowH > el.scrollTop + el.clientHeight - head) el.scrollTop = y + rowH - el.clientHeight + head;
  };
  const start = (r: number, c: number, typed?: string) => {
    if (userLocked(c) && r < nOwn) noteLocked();
    else if (formulaOf(c)) noteLocked('formula');
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
    if (editing || (!sel && !picks)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    // (columns or rows picked one by one: Delete or Ctrl+− leaves them out, Escape lets them go)
    if (!sel) {
      if (ev.key === 'Delete' || ev.key === 'Backspace' || (mod && (ev.key === '-' || ev.key === '_')) || ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.key === 'Escape') setPicks(null);
        else if (goneCols.length) removeCols(goneCols);
        else if (goneRows.length) removeRows(goneRows);
      }
      return;
    }
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
      // (whole columns or rows chosen: left out; else the cells emptied)
      ev.preventDefault();
      ev.stopPropagation();
      if (goneCols.length) removeCols(goneCols);
      else if (goneRows.length) removeRows(goneRows);
      else clear();
    } else if (ev.key === 'Escape') {
      ev.stopPropagation();
      setSel(null);
      setPicks(null);
    } else if (mod && (ev.key === '-' || ev.key === '_')) {
      // the whole columns or rows chosen left out
      ev.preventDefault();
      ev.stopPropagation();
      if (goneCols.length) removeCols(goneCols);
      else if (goneRows.length) removeRows(goneRows);
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
    if (span(lo.c, hi.c).some(userLocked)) noteLocked();
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
    // (not into a locked column)
    if (span(c0, Math.min(cols.length - 1, c0 + width - 1)).some(userLocked)) noteLocked();
    table.forEach((t, i) =>
      t.forEach((v, j) => {
        const c = colAt(c0 + j);
        if (c >= 0 && !(c0 + j < cols.length && (userLocked(c0 + j) || formulaOf(c0 + j)))) cells[`${rowAt(r0 + i)}:${c}`] = v.trim();
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
  // a column letter clicked: that column; Shift: up to it; Ctrl: added to (or taken from) the columns picked
  const selCols = (c: number, shift: boolean, add = false) => {
    if (add) {
      const had = picks?.on === 'col' ? picks.list : chosenCols;
      const list = had.includes(c) ? had.filter((x) => x !== c) : [...had, c].sort((a, b) => a - b);
      setPicks(list.length ? { on: 'col', list } : null);
      setSel(null);
    } else {
      setPicks(null);
      setSel(shift && sel ? { r0: 0, c0: sel.c0, r1: n - 1, c1: c } : { r0: 0, c0: c, r1: n - 1, c1: c });
    }
    focus();
  };
  const selRows = (r: number, shift: boolean, add = false) => {
    if (add) {
      const had = picks?.on === 'row' ? picks.list : chosenRows;
      const list = had.includes(r) ? had.filter((x) => x !== r) : [...had, r].sort((a, b) => a - b);
      setPicks(list.length ? { on: 'row', list } : null);
      setSel(null);
    } else {
      setPicks(null);
      setSel(shift && sel ? { r0: sel.r0, c0: 0, r1: r, c1: cols.length - 1 } : { r0: r, c0: 0, r1: r, c1: cols.length - 1 });
    }
    focus();
  };
  // right-click: on the selection it keeps it, else selects what was clicked (the column, the row, the cell)
  const openMenu = (ev: ReactMouseEvent, on: Menu['on'], r: number, c: number) => {
    ev.preventDefault();
    ev.stopPropagation();
    const inside = on === 'col' ? chosenCols.includes(c) : on === 'row' ? chosenRows.includes(r) : !picks && isSel(r, c);
    if (!inside) setPicks(null);
    if (!inside) setSel(on === 'col' ? { r0: 0, c0: c, r1: n - 1, c1: c } : on === 'row' ? { r0: r, c0: 0, r1: r, c1: cols.length - 1 } : { r0: r, c0: c, r1: r, c1: c });
    setMenu({ x: ev.clientX, y: ev.clientY, on });
    focus();
  };
  const selText = lo && hi && (hi.r > lo.r || hi.c > lo.c) ? `${hi.r - lo.r + 1} × ${hi.c - lo.c + 1} selected` : '';

  // the entries of the menu for the selection (columns: when a column or a cell was clicked; rows: a row or a cell)
  const items: { label: string; run: () => void; danger?: boolean; kbd?: string }[] = [];
  if (menu && picks) {
    const ownPicked = picks.on === 'col' ? picks.list.filter((c) => reads[c] >= 0) : [];
    if (ownPicked.length) items.push({ label: ownPicked.every(userLocked) ? `Unlock ${ownPicked.length === 1 ? 'column' : `${ownPicked.length} columns`}` : `Lock ${ownPicked.length === 1 ? 'column' : `${ownPicked.length} columns`}`, run: () => toggleLock(ownPicked) });
    if (picks.on === 'col' && goneCols.length) {
      const hides = goneCols.every(lockedCol);
      items.push({ label: `${hides ? 'Hide' : 'Delete'} ${goneCols.length === 1 ? 'column' : `${goneCols.length} columns`}`, run: () => removeCols(goneCols), danger: true, kbd: 'Delete' });
    }
    if (picks.on === 'row' && goneRows.length) items.push({ label: `Delete ${goneRows.length === 1 ? 'row' : `${goneRows.length} rows`}`, run: () => removeRows(goneRows), danger: true, kbd: 'Delete' });
  } else if (menu && lo && hi) {
    const nc = hi.c - lo.c + 1;
    if (menu.on !== 'row') {
      if (canAddCol) items.push({ label: 'Insert column left', run: () => insertCol(lo.c), kbd: menu.on === 'col' ? 'Ctrl+Shift+=' : undefined }, { label: 'Insert column right', run: () => insertCol(hi.c + 1) });
      if (nc === 1 && canArrange(lo.c)) {
        if (lo.c > 0) items.push({ label: 'Move column left', run: () => moveCol(lo.c, lo.c - 1) });
        if (lo.c < cols.length - 1) items.push({ label: 'Move column right', run: () => moveCol(lo.c, lo.c + 1) });
      }
      if (nc === 1 && !lockedCol(lo.c) && !userLocked(lo.c) && cols[lo.c]?.text && !formulaOf(lo.c)) items.push({ label: 'Convert to numbers…', run: () => setConv([lo.c]) });
      // (a Workbook: a column of its own given by a formula, or a new one)
      if (formulas && nc === 1 && reads[lo.c] >= 0 && !userLocked(lo.c)) {
        const at = reads[lo.c];
        if (formulaOf(lo.c)) items.push({ label: 'Edit formula…', run: () => setFxFor(at) }, { label: 'Remove formula (keep the values)', run: () => writeOnce(at, cols[lo.c].values) });
        else items.push({ label: 'Set column values (formula)…', run: () => setFxFor(at) });
      }
      if (formulas && canAddCol && !readOnly && nc === 1) items.push({ label: 'Insert column with formula…', run: () => insertFormulaCol(hi.c + 1) });
      // (a column of its own locked: its name and values kept)
      const own = span(lo.c, hi.c).filter((c) => reads[c] >= 0);
      if (own.length) items.push({ label: own.every(userLocked) ? `Unlock ${own.length === 1 ? 'column' : `${own.length} columns`}` : `Lock ${own.length === 1 ? 'column' : `${own.length} columns`}`, run: () => toggleLock(own) });
      const gone = span(lo.c, hi.c).filter(canRemove);
      if (gone.length) {
        const hides = gone.every(lockedCol);
        items.push({ label: `${hides ? 'Hide' : 'Delete'} ${gone.length === 1 ? 'column' : `${gone.length} columns`}`, run: () => removeCols(gone), danger: true, kbd: menu.on === 'col' ? 'Delete' : undefined });
      }
    }
    // (the rows of a sheet of the inputs: moved one place)
    if (menu.on !== 'col' && rowLayout && hi.r === lo.r && lo.r < n) {
      if (lo.r > 0) items.push({ label: 'Move row up', run: () => (rowLayout.onMove(lo.r, lo.r - 1), setSel({ ...sel!, r0: lo.r - 1, r1: lo.r - 1 })) });
      if (lo.r < n - 1) items.push({ label: 'Move row down', run: () => (rowLayout.onMove(lo.r, lo.r + 1), setSel({ ...sel!, r0: lo.r + 1, r1: lo.r + 1 })) });
    }
    if (menu.on !== 'col' && rowsEditable) items.push({ label: 'Insert row above', run: () => insertRow(lo.r), kbd: menu.on === 'row' ? 'Ctrl+Shift+=' : undefined }, { label: 'Insert row below', run: () => insertRow(Math.min(n, hi.r + 1)) });
    const rowsOut = span(lo.r, Math.min(hi.r, n - 1)).filter(rowGone);
    if (menu.on !== 'col' && rowsOut.length) items.push({ label: `Delete ${rowsOut.length === 1 ? 'row' : `${rowsOut.length} rows`}`, run: () => removeRows(rowsOut), danger: true, kbd: menu.on === 'row' ? 'Delete' : undefined });
  }

  return (
    <div className="worksheet">
      <div ref={box} tabIndex={0} className="sheet-scroll nowheel nodrag nokey" style={{ maxHeight: viewH, ...(lk.h ? { height: viewH } : {}) }} onScroll={(ev) => setTop(ev.currentTarget.scrollTop)} onKeyDown={tableKeys} onCopy={onCopy} onPaste={onPaste}>
        <table>
          <thead>
            <tr>
              <th className="rowhead" title="Click a column letter: the whole column (Shift: several); a row number: the whole row. Right-click: insert, delete, move">
                #
              </th>
              {cols.map((_c, j) => (
                <th
                  key={j}
                  className={`col-letter${userLocked(j) || (lockedCol(j) && !readOnly) ? ' locked-col' : ''}${formulaOf(j) ? ' fx-col-head' : ''}${chosenCols.includes(j) ? ' sel' : ''}${dropAt === j && moving !== null && moving !== j ? (moving < j ? ' drop-after' : ' drop-before') : ''}`}
                  title={canArrange(j) ? 'Select the whole column (Shift: up to this one); drag it to move the column; right-click: insert, delete, move' : 'Select the whole column (Shift: up to this one)'}
                  onClick={(ev) => selCols(j, ev.shiftKey, ev.ctrlKey || ev.metaKey)}
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
                  {userLocked(j) && (<span className="sheet-lock" aria-label="locked"><Lock {...IC} /></span>)}
                  {formulaOf(j) && (
                    <span className="sheet-fx" title={`${columnLetter(j)} = ${formulaOfKept(formulaOf(j)!.formula, cols, colKeys)}${formulaOf(j)!.rows && formulaOf(j)!.rows!.mode !== 'all' ? ' (on the rows chosen)' : ''}. Computed again when its columns change; right-click ▸ Edit formula`}>
                      ƒ
                    </span>
                  )}
                  {columnLetter(j)}({ROLE_LABELS[roleOf(cols, j)]})
                  {onLook && <span className="col-grip" title="Drag: the column's width; double-click: it fits its values" onPointerDown={(ev) => dragCol(ev, j)} onClick={(ev) => ev.stopPropagation()} onDoubleClick={(ev) => (ev.stopPropagation(), fitCol(j))} />}
                  {canRemove(j) && (
                    <button
                      className="sheet-x"
                      draggable={false}
                      title={lockedCol(j) ? 'Hide this column of the inputs (it comes back from the foot of the table)' : 'Leave this column out'}
                      onPointerDown={(ev) => {
                        // (on the press: a click could be taken by the drag of the column letter it sits in)
                        if (ev.button !== 0) return;
                        ev.preventDefault();
                        ev.stopPropagation();
                        removeCols([j]);
                      }}
                      onClick={(ev) => ev.stopPropagation()}
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
                <th key={j} style={wide(j)}>
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
                <th key={j} style={wide(j)}>
                  <input
                    style={colW(c.name) ? { width: colW(c.name) } : undefined}
                    className={!plain && !lockedCol(j) && e.cols?.[reads[j]]?.name !== undefined ? 'edited' : ''}
                    value={nameDraft?.j === j ? nameDraft.v : c.name}
                    placeholder={columnLetter(j)}
                    spellCheck={false}
                    readOnly={lockedCol(j) || userLocked(j)}
                    title={userLocked(j) ? 'Locked column: right-click its letter ▸ Unlock column to rename it' : 'The name of the column, with its unit if it has one: “Wavelength (nm)”'}
                    onFocus={() => !lockedCol(j) && !userLocked(j) && setNameDraft({ j, v: c.name })}
                    onClick={() => userLocked(j) && noteLocked()}
                    onBlur={() => setNameDraft(null)}
                    onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === 'Escape') && (ev.currentTarget as HTMLInputElement).blur()}
                    onChange={(ev) => {
                      setNameDraft({ j, v: ev.target.value });
                      setHead(j, { name: ev.target.value });
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {first > 0 && (
              <tr style={{ height: first * rowH }}>
                <td colSpan={cols.length + 1} />
              </tr>
            )}
            {Array.from({ length: last - first }, (_, k) => first + k).map((r) => (
              <tr key={r} style={{ height: rowH }}>
                <td className="rowhead" title={rowsEditable ? 'Select the whole row (Shift: up to this one); right-click: insert, delete' : 'Select the whole row (Shift: up to this one)'} onClick={(ev) => selRows(r, ev.shiftKey, ev.ctrlKey || ev.metaKey)} onContextMenu={(ev) => openMenu(ev, 'row', r, 0)}>
                  {r + 1}
                  {onLook && <span className="row-grip" title="Drag: the rows' height (all of them)" onPointerDown={dragRow} onClick={(ev) => ev.stopPropagation()} />}
                  {rowGone(r) && (
                    <button
                      className="sheet-x"
                      title="Leave this row out"
                      onPointerDown={(ev) => {
                        if (ev.button !== 0) return;
                        ev.preventDefault();
                        ev.stopPropagation();
                        removeRows([r]);
                      }}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <X {...IC} />
                    </button>
                  )}
                </td>
                {cols.map((_c, j) =>
                  editing && editing.r === r && editing.c === j ? (
                    <td key={j} className="editing" style={wide(j)}>
                      <input autoFocus value={draft} spellCheck={false} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => commit()} onKeyDown={editKeys} />
                    </td>
                  ) : (
                    <td
                      key={j}
                      style={wide(j)}
                      data-r={r}
                      data-c={j}
                      className={`${!locked(r, j) && edited(r, j) ? 'edited' : ''}${userLocked(j) || (lockedCol(j) && !readOnly) ? ' locked-col' : ''}${formulaOf(j) ? ' fx-cell' : ''}${isSel(r, j) ? ' sel' : ''}${inFill(r, j) ? ' fill-preview' : ''}${showHandle && hi && r === hi.r && j === hi.c ? ' fill-at' : ''}`}
                      onMouseDown={(ev) => {
                        if (ev.button !== 0) return;
                        dragging.current = true;
                        setPicks(null);
                        setSel(ev.shiftKey && sel ? { ...sel, r1: r, c1: j } : { r0: r, c0: j, r1: r, c1: j });
                        focus();
                        ev.preventDefault();
                      }}
                      onMouseEnter={() => dragging.current && sel && setSel({ ...sel, r1: r, c1: j })}
                      onDoubleClick={() => start(r, j)}
                      onContextMenu={(ev) => openMenu(ev, 'cell', r, j)}
                    >
                      {shown(r, j)}
                      {showHandle && hi && r === hi.r && j === hi.c && <span className="fill-grip" title="Drag down, up, right or left: the cells go on from these (numbers as a series, Run 1 → Run 2; one number copied, Ctrl: counted on); double-click: down as far as the column beside" onPointerDown={startFill} onDoubleClick={fillDown} onMouseDown={(ev) => ev.stopPropagation()} />}
                    </td>
                  ),
                )}
              </tr>
            ))}
            {last < n && (
              <tr style={{ height: (n - last) * rowH }}>
                <td colSpan={cols.length + 1} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {onLook && <span className="sheet-grip nodrag" title="Drag: the node's width and the table's height" onPointerDown={dragCorner} />}
      {lockNote && <div className="msg warn sheet-lock-note">{lockNote === 'formula' ? 'This column is given by a formula: right-click its letter ▸ Edit formula, or Remove formula to type in it.' : 'Locked column: right-click its letter ▸ Unlock column to change it.'}</div>}
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
        {(goneCols.length > 0 || goneRows.length > 0) && (
          <button className="nodrag danger" title="Leave out the whole columns (rows) chosen (Delete); Ctrl + click on a letter or a number picks several, not side by side" onClick={() => (goneCols.length ? removeCols(goneCols) : removeRows(goneRows))}>
            {goneCols.length ? `${goneCols.every(lockedCol) ? 'Hide' : 'Delete'} ${goneCols.length === 1 ? 'column' : `${goneCols.length} columns`}` : `Delete ${goneRows.length === 1 ? 'row' : `${goneRows.length} rows`}`}
          </button>
        )}
        <span className="hint" title="Double-click, Enter or type to change a cell; Ctrl+C / Ctrl+V copy and paste (Ctrl+Shift+C: with the names); Delete empties the cells selected, and leaves out whole columns or rows chosen (a letter or a number clicked; Shift: up to it; Ctrl: several, not side by side); right-click: insert, delete, move columns and rows">
          {n} rows × {cols.length} columns
          {picks ? ` · ${picks.list.length} ${picks.on === 'col' ? 'columns' : 'rows'} picked` : selText && ` · ${selText}`}
          {count > 0 && ` · ${count} change${count > 1 ? 's' : ''} by hand (marked)`}
        </span>
        {!!rowLayout?.hidden && (
          <button className="nodrag" title="The rows left out of this sheet of the inputs shown again" onClick={rowLayout.onShowAll}>
            Show {rowLayout.hidden} hidden row{rowLayout.hidden === 1 ? '' : 's'}
          </button>
        )}
        {!!layout?.hidden?.length && (
          <button className="nodrag" title={`Hidden: ${layout.hidden.join(', ')}`} onClick={layout.onShowAll}>
            Show {layout.hidden.length} hidden
          </button>
        )}
        {count > 0 && (
          <button className="nodrag danger" onClick={() => void ask('Undo every change made by hand in this table (the file stays as it is)?', { ok: 'Undo all', danger: true }).then((yes) => yes && onEdits(e.locked ? { locked: e.locked } : {}))}>
            Undo all changes
          </button>
        )}
      </div>
      {conv ? (
        <ConvertPanel
          ds={dataset}
          cols={conv}
          onConvert={(r) => {
            onEdits(convertInSheet(e, map, dataset, conv.map((c) => ({ shown: c, read: reads[c] })), r));
            setConv(null);
          }}
          onCancel={() => setConv(null)}
        />
      ) : (
        !later && proposed.length > 0 && <ConvertProposal ds={dataset} cols={proposed} onOpen={() => setConv(proposed.map((q) => q.c))} onLater={() => setLater(true)} />
      )}
      {formulas && fxFor !== null && reads.includes(fxFor) && (
        <FormulaWindow
          columns={cols}
          keys={colKeys}
          sheet={formulas.sheet}
          j={reads.indexOf(fxFor)}
          given={e.formulas?.[fxFor]}
          onSave={(f, once) => (once ? writeOnce(fxFor, once) : onEdits({ ...e, formulas: { ...e.formulas, [fxFor]: f } }))}
          onClose={() => setFxFor(null)}
        />
      )}
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
