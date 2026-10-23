// Data nodes: Import, Extract column, Math column, Generate column, Columns, Auto-extract.
import { ExportTable } from './ExportTable.tsx';
import { MATH_PRESETS } from '../engine/mathPresets.ts';
import { Fragment, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { MathInput, NodeResult } from '../engine/evaluate.ts';
import { isCommentLine, columnLetter, textLines, type CsvOptions, type Delimiter, type Decimal } from '../engine/csv.ts';
import { cellText, fmtNum, ROLE_LABELS, titleOf, type Column, type ColumnRole } from '../engine/table.ts';
import { ROLE_OPTIONS, type ExtractNames, type ExtractRule } from '../engine/extract.ts';
import { COLUMNS_SPEC_KEYS, formulaShown, formulaStored, lineLetter, type ColumnsSpec, type ColumnItem, type ColumnLine, type ComputedColumn, type ComputedKind } from '../engine/columns.ts';
import { GEN_SPEC_DEFAULTS, type GenSpec } from '../engine/gencol.ts';
import { hasEdits, type SheetEdits } from '../engine/sheet.ts';
import { ACCEPT, ENCODINGS, pickDataFiles, readFiles } from '../readFiles.ts';
import type { AppNode, ColumnsData, ColumnsNode, AutoExtractData, AutoExtractNode, ExtractNode, GenColData, GenColNode, ImportData, ImportNode, MathColData, MathColNode } from '../types.ts';
import { AutoText, Check, Field, InPort, Messages, NumInput, OutPort, Select, TextInput, ResultSummary } from './ui.tsx';
import { RowRules } from './RowRules.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { Worksheet } from './Worksheet.tsx';
import { maxOf } from '../engine/minmax.ts';
import { RotateCcw, X } from 'lucide-react';
import { IC } from './iconProps.ts';
import { ask, notify } from '../ui/dialogStore.ts';

const PREVIEW_ROWS = 6;

// The first rows of some columns, under their names.
export function DataPreview({ columns, rows = PREVIEW_ROWS }: { columns: Column[]; rows?: number }) {
  if (!columns.length) return null;
  const n = maxOf(columns.map((c) => c.values.length));
  const shown = Math.min(n, rows);
  return (
    <div className="data-scroll nowheel nodrag">
      <table>
        <thead>
          <tr>
            <th className="rowhead" />
            {columns.map((c, j) => (
              <th key={j}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: shown }, (_, i) => (
            <tr key={i}>
              <td className="rowhead">{i + 1}</td>
              {columns.map((c, j) => (
                <td key={j}>{i < c.values.length ? cellText(c, i) : ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint">
        {n} row{n === 1 ? '' : 's'} × {columns.length} column{columns.length === 1 ? '' : 's'}
        {n > shown ? ` (first ${shown} shown)` : ''}
      </div>
    </div>
  );
}

// ---- Import ----

const DELIMS: [Delimiter, string][] = [
  ['auto', 'automatic'],
  [',', 'comma ,'],
  [';', 'semicolon ;'],
  ['\t', 'tab'],
  [' ', 'spaces'],
  ['|', 'bar |'],
  ['custom', 'other'],
];
const DELIM_NAME: Record<string, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab', ' ': 'spaces', '|': 'bar' };
const LARGE = 2e6;

export function ImportNodeView({ id, data }: NodeProps<ImportNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (patch: Partial<ImportData>) => updateNodeData(id, patch);
  const setCsv = (patch: Partial<CsvOptions>) => set({ csv: { ...data.csv, ...patch } });
  const file = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  // another file: the changes made by hand to the old one are dropped (after asking)
  const changed = hasEdits(data.edits) || Object.values(data.sheetEdits ?? {}).some(hasEdits);
  const fresh = async () => !changed || (await ask('Open another table? The changes made by hand in the worksheet belong to the current one and are dropped.', { ok: 'Open', danger: true }));
  const cleared = () => ({ textId: crypto.randomUUID().slice(0, 8), edits: undefined, sheetEdits: undefined, sheet: 0 });
  // one text file as before; a spreadsheet workbook (.xlsx, .xls, .ods) or several files: sheets
  // the files opened in this session: read again when another encoding is chosen
  const lastFiles = useRef<File[]>([]);
  const load = async (files: File[], encoding = data.csv.encoding ?? 'auto') => {
    if (!files.length || !(await fresh())) return;
    lastFiles.current = files;
    try {
      const got = await readFiles(files, encoding);
      const fileName = files.length === 1 ? files[0].name : `${files.length} files`;
      set('text' in got ? { ...cleared(), text: got.text, sheets: undefined, fileName } : { ...cleared(), text: '', sheets: got.sheets, fileName });
    } catch (e) {
      notify(`The file could not be read: ${(e as Error).message}`);
    }
  };
  const onDrop = (e: DragEvent) => {
    const fs = [...(e.dataTransfer.files ?? [])];
    if (!fs.length) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    void load(fs);
  };
  const csv = r?.view.csv;
  const sheets = data.sheets ?? [];
  const k = Math.min(sheets.length - 1, Math.max(0, data.sheet ?? 0));
  const shownSheet = sheets.length ? sheets[k] : null;
  const shownText = shownSheet ? shownSheet.text : data.text;
  const anyExcel = sheets.some((x) => x.excel);
  const size = sheets.length ? sheets.reduce((a, x) => a + x.text.length, 0) : data.text.length;
  const edits = shownSheet ? data.sheetEdits?.[shownSheet.name] : data.edits;
  const setEdits = (e: SheetEdits) => (shownSheet ? set({ sheetEdits: { ...data.sheetEdits, [shownSheet.name]: e } }) : set({ edits: e }));
  const lines = shownText && !shownSheet?.excel ? textLines(shownText.slice(0, 20000)).slice(0, 12) : [];
  const header = csv ? csv.headerLines : 0;
  // nothing read or typed yet: the node offers to open, paste or start a table itself
  const empty = !data.text && !sheets.length && !r?.view.sheet;
  // the browser's dialog with the kinds of data files named (else the file input)
  const openFiles = async () => {
    const fs = await pickDataFiles(() => file.current?.click());
    if (fs?.length) await load(fs);
  };
  const openButtons = (
    <>
      <button className="nodrag" onClick={() => void openFiles()} title="A text table (.csv, .txt, .tsv, .dat …), a spreadsheet workbook (.xlsx, .xls, .ods); several files at once make a workbook (each a sheet)">
        Open file
      </button>
      <button className="nodrag" onClick={() => folder.current?.click()} title="Every data file of a folder, each a sheet (in the order of their names): ready for a Batch">
        Open a folder
      </button>
      <button
        className="nodrag"
        title="The text copied to the clipboard (e.g. cells copied from a spreadsheet)"
        onClick={async () => {
          try {
            const t = await navigator.clipboard.readText();
            if (t.trim() && (await fresh())) set({ ...cleared(), text: t, sheets: undefined, fileName: 'pasted' });
          } catch {
            notify('The browser did not allow reading the clipboard. Save the text to a file and open it.');
          }
        }}
      >
        Paste
      </button>
    </>
  );
  const lineOptions: [number, string][] = [
    [0, 'none'],
    [1, 'line 1'],
    [2, 'line 2'],
    [3, 'line 3'],
    [4, 'line 4'],
  ];
  return (
    <div
      className={`node node-import${over ? ' drop-over' : ''}`}
      style={data.look?.w ? { width: data.look.w } : undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {/* in the node: the file, its worksheet and sheets; how it is read in the panel */}
      <div className="row">
        {empty && openButtons}
        <span className="muted ellipsis" title={data.fileName}>
          {data.fileName ? `${data.fileName}${sheets.length ? ` · ${sheets.length} sheet${sheets.length > 1 ? 's' : ''}` : ''}` : data.edits ? 'a table typed in' : 'or drop files here'}
        </span>
        {r?.outputs.out?.t === 'dataset' && (
          <button className="nodrag btn-run plot-btn" title="Plot these columns: choose X, the Y columns and their errors — a figure made and connected beside this node" onClick={() => window.dispatchEvent(new CustomEvent('graph-flow:plot', { detail: id }))}>
            Plot…
          </button>
        )}
        <input
          ref={file}
          type="file"
          hidden
          multiple
          accept={ACCEPT}
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            e.target.value = '';
            void load(fs);
          }}
        />
        {/* a folder: its data files (the others left out), in the natural order of their names */}
        <input
          ref={folder}
          type="file"
          hidden
          {...{ webkitdirectory: '' }}
          onChange={(e) => {
            const exts = ACCEPT.split(',').map((x) => x.trim().toLowerCase());
            const fs = [...(e.target.files ?? [])].filter((f) => exts.some((x) => f.name.toLowerCase().endsWith(x))).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            e.target.value = '';
            if (fs.length) void load(fs);
            else notify('No data file in that folder.');
          }}
        />
      </div>
      {empty && (
        <button className="nodrag" title="A table to type in (2 columns, 10 rows; add more below it)" onClick={() => set({ edits: { addRows: 10, addCols: 2 } })}>
          Start an empty table
        </button>
      )}
      {r?.outputs.out?.t === 'dataset' && r.view.sheet && (
        <>
          <Worksheet key={shownSheet?.name ?? ''} dataset={r.outputs.out.v} map={r.view.sheet} edits={edits} onEdits={setEdits} look={data.look} onLook={(look) => set({ look })} />
          {sheets.length > 1 && (
            <div className="sheet-tabs nowheel" title="The sheet shown here and given on the “dataset” output (the “workbook” output gives all of them)">
              {sheets.map((x, j) => (
                <button key={j} className={`nodrag${j === k ? ' on' : ''}`} onClick={() => set({ sheet: j })}>
                  {x.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <NodeOptions>
      <div className="row">{openButtons}</div>
      <Field label="Dataset name">
        <TextInput value={data.name} placeholder={data.fileName.replace(/\.[^.]+$/, '') || 'data'} onChange={(name) => set({ name })} />
      </Field>
      <div className="grid2">
        <Field label="Format" title="A text table, or a Touchstone file (.s1p, .s2p … .sNp: the parameters of a network at every frequency, read with their names); automatic: Touchstone by the file's name or its option line (# GHz S RI R 50)">
          <Select<NonNullable<CsvOptions['format']>>
            value={data.csv.format ?? 'table'}
            options={[
              ['auto', csv ? `auto (${csv.touchstone ? 'Touchstone' : 'text table'})` : 'automatic'],
              ['table', 'text table'],
              ['touchstone', 'Touchstone (.sNp)'],
            ]}
            onChange={(format) => setCsv({ format })}
          />
        </Field>
        {csv?.touchstone ? (
          <Field label="Also" title="For every parameter, its dB and phase (when the file writes the real and imaginary parts), else its real and imaginary parts">
            <Check label={csv.touchstone.format === 'RI' ? 'dB and phase' : 'Re and Im'} value={data.csv.touchExtra !== false} onChange={(touchExtra) => setCsv({ touchExtra })} />
          </Field>
        ) : (
          <Field label="Comment lines" title="Lines that are not data, left out wherever they are: automatic — those starting with ! # % or //; none; or the marks you write (one or more, separated by spaces: “#”, “! %”, “REM”)">
            <span className="row">
              <Select<'auto' | 'none' | 'custom'>
                value={data.csv.comment === 'auto' ? 'auto' : data.csv.comment ? 'custom' : 'none'}
                options={[
                  ['auto', 'auto (! # % //)'],
                  ['none', 'none'],
                  ['custom', 'these marks'],
                ]}
                onChange={(m) => setCsv({ comment: m === 'auto' ? 'auto' : m === 'none' ? '' : data.csv.comment && data.csv.comment !== 'auto' ? data.csv.comment : '#' })}
              />
              {data.csv.comment && data.csv.comment !== 'auto' && <TextInput className="delim-chars mono" value={data.csv.comment} placeholder="#" title="The marks that start a comment line, separated by spaces" onChange={(comment) => setCsv({ comment: comment.trim() ? comment : '#' })} />}
            </span>
          </Field>
        )}
        <Field label="Delimiter">
          <Select value={data.csv.delimiter} options={DELIMS.map(([v, l]) => [v, v === 'auto' && csv && DELIM_NAME[csv.delimiter] ? `auto (${DELIM_NAME[csv.delimiter]})` : l])} onChange={(delimiter) => setCsv({ delimiter })} />
          {data.csv.delimiter === 'custom' && <TextInput className="delim-chars mono" value={data.csv.custom ?? ''} placeholder="e.g. ::" title="The delimiter: one or more characters (\t: a tab)" onChange={(custom) => setCsv({ custom })} />}
        </Field>
        <Field label="Decimal">
          <Select<Decimal> value={data.csv.decimal} options={[['auto', csv ? `auto (${csv.decimal})` : 'automatic'], ['.', 'point .'], [',', 'comma ,']]} onChange={(decimal) => setCsv({ decimal })} />
        </Field>
        <Field label="Skip lines" title="Lines at the top of the file that are not part of the table (instrument header, notes)">
          <NumInput className="tiny" min={0} step={1} value={data.csv.skip} onChange={(v) => setCsv({ skip: Math.max(0, Math.floor(v) || 0) })} />
        </Field>
        <Field label="Names" title="The line (after the skipped ones) with the column names">
          <Select value={data.csv.nameLine} options={[[-1, csv && data.csv.nameLine < 0 ? `auto (${header ? 'line 1' : 'none'})` : 'automatic'], ...lineOptions]} onChange={(nameLine) => setCsv({ nameLine })} />
        </Field>
        <Field label="Units" title="A line with the units of the columns: written into the names (Wavelength + nm → “Wavelength (nm)”)">
          <Select value={data.csv.unitLine} options={lineOptions} onChange={(unitLine) => setCsv({ unitLine })} />
        </Field>
        <Field label="Notes line" title="A line of notes on the columns (after the names): left out">
          <Select value={data.csv.commentLine} options={lineOptions} onChange={(commentLine) => setCsv({ commentLine })} />
        </Field>
        <Field label="Skip at the end" title="Lines left out at the end of the file (a footer some instruments write: totals, notes)">
          <NumInput className="tiny" min={0} step={1} value={data.csv.skipEnd ?? 0} onChange={(v) => setCsv({ skipEnd: Math.max(0, Math.floor(v) || 0) || undefined })} />
        </Field>
        <Field label="Thousands" title="A thousands separator, taken out of the numbers: 1,234.5 (comma), 1.234,5 (point), 1 234,5 (space), 1'234.5 (apostrophe)">
          <Select<NonNullable<CsvOptions['thousands']>>
            value={data.csv.thousands ?? ''}
            options={[
              ['', 'none'],
              [',', 'comma ,'],
              ['.', 'point .'],
              [' ', 'space'],
              ["'", "apostrophe '"],
            ]}
            onChange={(thousands) => setCsv({ thousands: thousands || undefined })}
          />
        </Field>
      </div>
      {!csv?.touchstone && !!data.csv.comment && (
        <div className="row wrap">
          <Check label="Comments after the data too" title="A mark after the numbers of a line (1.2  3.4  # note) starts a comment as well" value={!!data.csv.commentEnd} onChange={(commentEnd) => setCsv({ commentEnd: commentEnd || undefined })} />
          <Check label="Names from the last comment" title="When the data start at once (no line of names), the last comment line before them gives the names — if it has as many as the data has columns (names with spaces are kept whole when two spaces or a tab separate them)" value={!!data.csv.namesFromComment} onChange={(namesFromComment) => setCsv({ namesFromComment })} />
          {csv?.commentNames && <span className="hint">the names are from a comment</span>}
        </div>
      )}
      {csv?.touchstone && (
        <div className="hint">
          Touchstone: {csv.touchstone.ports} port{csv.touchstone.ports > 1 ? 's' : ''}, {csv.touchstone.param} parameters, {csv.touchstone.format === 'RI' ? 'real / imaginary' : csv.touchstone.format === 'MA' ? 'magnitude / angle' : 'dB / angle'}, frequency in {csv.touchstone.unit}, {csv.touchstone.z0} Ω{csv.touchstone.version > 1 ? `, version ${csv.touchstone.version}` : ''}
        </div>
      )}
      <Field label="Missing values" title="Cells that mean “no value”, separated by commas — read as empty cells: N/A, -, --, -999">
        <TextInput value={data.csv.missing ?? ''} placeholder="e.g. N/A, -, -999" onChange={(missing) => setCsv({ missing: missing || undefined })} />
      </Field>
      <Field label="Encoding" title="How the bytes of a text file are read (automatic: UTF-8, UTF-16 or Western). The file opened in this session is read again; a file of an older session must be opened again.">
        <Select
          value={data.csv.encoding ?? 'auto'}
          options={ENCODINGS}
          onChange={(encoding) => {
            setCsv({ encoding: encoding === 'auto' ? undefined : encoding });
            if (lastFiles.current.length) void load(lastFiles.current, encoding);
          }}
        />
      </Field>
      {anyExcel && <div className="hint">Spreadsheet sheets are read cell by cell (the delimiter and decimal apply to text files); the header lines apply to every sheet.</div>}
      {lines.length > 0 && (
        <details className="raw-lines" open={!csv?.dataLines}>
          <summary>The file’s first lines</summary>
          <pre className="nowheel nodrag">
            {lines.map((l, k) => {
              const cls = k < data.csv.skip ? 'skipped' : (data.csv.comment || csv?.touchstone) && isCommentLine(l, csv?.touchstone ? '! #' : data.csv.comment) ? 'skipped' : k < data.csv.skip + header ? 'header' : '';
              return (
                <div key={k} className={cls}>
                  <span className="ln">{k + 1}</span>
                  {l.replace(/\t/g, ' ⇥ ') || ' '}
                </div>
              );
            })}
          </pre>
        </details>
      )}
      {size > LARGE && <div className="msg warn">A large file ({(size / 1e6).toFixed(1)} MB): it is kept in the project, and the browser keeps about 5 MB — use Save (a file) to keep it.</div>}
      {r?.outputs.out?.t === 'dataset' && (
        <ExportTable name={data.name || data.fileName.replace(/\.[^.]+$/, '') || 'data'} shown={r.outputs.out.v} book={r.outputs.book?.t === 'workbook' ? r.outputs.book.v : undefined} value={data.export} onChange={(e) => set({ export: e })} />
      )}
      <Messages result={r} />
      </NodeOptions>
      <Messages result={r} />
      <OutPort label={shownSheet ? `dataset (${shownSheet.name})` : 'dataset'} port="dataset" />
      {sheets.length > 0 && <OutPort label={`workbook (${sheets.length} sheet${sheets.length > 1 ? 's' : ''})`} port="workbook" id="book" title="All the sheets, for Extract column (choose the sheet) or Auto-extract" />}
    </div>
  );
}

// ---- Extract column ----

export function ExtractNodeView({ id, data }: NodeProps<ExtractNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const avail = r?.view.available ?? [];
  const idx = data.column ? (avail[data.index]?.name === data.column ? data.index : avail.findIndex((c) => c.name === data.column)) : 0;
  const out = r?.outputs.out?.t === 'column' ? r.outputs.out.v : undefined;
  const val = r?.outputs.out?.t === 'scalar' ? r.outputs.out.v : undefined;
  return (
    <div className="node node-extract">
      <InPort label="dataset" port="dataset" id="in" title="A dataset, or a workbook (then choose the sheet)" />
      <NodeOptions>
      <Field label="Column">
        <select className="nodrag" value={idx} onChange={(e) => updateNodeData(id, { column: avail[Number(e.target.value)]?.name ?? '', index: Number(e.target.value) })}>
          {idx < 0 && <option value={-1}>{data.column} (missing)</option>}
          {avail.map((c, k) => (
            <option key={k} value={k}>
              {columnLetter(k)} · {titleOf(c)}
            </option>
          ))}
          {!avail.length && <option value={0}>{data.column || '—'}</option>}
        </select>
      </Field>
      <div className="row">
        <Field label="Output" title="The whole column, or one value of it (a row)">
          <Select<'column' | 'value'> value={data.value ? 'value' : 'column'} options={[['column', 'column'], ['value', 'one value']]} onChange={(v) => updateNodeData(id, { value: v === 'value' })} />
        </Field>
        {data.value && (
          <Field label="Row" title="The row of the value (1 … n)">
            <NumInput value={data.row ?? 1} min={1} step={1} onChange={(row) => updateNodeData(id, { row })} />
          </Field>
        )}
      </div>
      {out && (
        <div className="hint ellipsis">
          {out.values.length} rows: {Array.from(out.values.slice(0, 4), (_, i) => cellText(out, i)).join(', ')}
          {out.values.length > 4 ? ', …' : ''}
        </div>
      )}
      {val && (
        <div className="hint ellipsis">
          = <span className="val">{fmtNum(val.value, 7)}</span>
        </div>
      )}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      {data.value ? <OutPort label="value" port="scalar" /> : <OutPort label="column" port="column" />}
    </div>
  );
}

// ---- Math column ----

export function MathColNodeView({ id, data }: NodeProps<MathColNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<MathColData>) => updateNodeData(id, patch);
  const r = useNodeResult(id);
  const conns = useNodeConnections({ handleType: 'target' });
  // one free port after the last one used
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, maxOf(used)) + 2);
  const byPort = new Map((r?.view.inputs ?? []).map((i) => [i.port, i]));
  const out = r?.outputs.out?.t === 'column' ? r.outputs.out.v : undefined;
  const val = r?.outputs.out?.t === 'scalar' ? r.outputs.out.v : undefined;
  const one = data.output === 'value';
  const preset = MATH_PRESETS.find((p) => p.formula === data.formula.trim() && p.name === data.name) ?? MATH_PRESETS.find((p) => p.formula === data.formula.trim());
  const withErr = !!data.errors?.trim();
  return (
    <div className="node node-mathcol">
      {Array.from({ length: count }, (_, k) => {
        const inp = byPort.get(k);
        return (
          <InPort key={k} label={columnLetter(k)} port="column" id={`in-${k}`} title="A column, or a single value (e.g. a mean)">
            <span className="muted ellipsis">{inp ? (inp.kind === 'scalar' ? `${inp.name} (one value)` : `${titleOf(inp)} · ${inp.rows} rows`) : 'connect a column'}</span>
          </InPort>
        );
      })}
      {/* in the node: the formula and the size of the result; the options in the panel */}
      <div className="node-summary mono ellipsis" title={data.formula ? `${out?.name ?? ''} = ${data.formula}` : 'Click the node: the formula and the options in the panel'}>
        {data.formula ? `= ${data.formula}` : <span className="muted">no formula yet — click the node</span>}
        {!one && (data.rules?.length ?? 0) > 0 && <span className="muted"> · {data.rules!.length} rule{data.rules!.length > 1 ? 's' : ''}</span>}
      </div>
      {out && (
        <div className="hint ellipsis">
          {out.name} · {out.values.length} rows
        </div>
      )}
      {val && (
        <div className="hint ellipsis">
          {val.name} = <span className="val">{fmtNum(val.value, 7)}</span>
        </div>
      )}
      <NodeOptions>
        <div className="formula-row">
          <span className="muted">=</span>
          <AutoText className="mono" value={data.formula} placeholder={one ? 'e.g. max(A) - min(A), mean(A)/mean(B)' : 'e.g. A*100, (A - B)/C, A/max(A)'} onChange={(formula) => set({ formula })} />
        </div>
        <div className="hint">Of a whole column: mean(A), median, sd, sum, min, max, count, first, last (one column in the parentheses; empty and masked values left out). Functions of your own before the formula: f(t) = exp(-t/3); A*f(B).</div>
        <div className="row wrap">
          <Check label="Complex numbers" title="The formula in complex numbers: j the imaginary unit (i is the row) — A + j*B, abs, arg, re, im, conj, exp, ln, sqrt, sin, cos, polar(r, θ) …; the inputs are real" value={!!data.complex} onChange={(complex) => set({ complex: complex || undefined })} />
          {data.complex && (
            <Select<NonNullable<MathColData['part']>>
              value={data.part ?? 're'}
              title="The part of the complex result given"
              options={[
                ['re', 'real part'],
                ['im', 'imaginary part'],
                ['abs', 'magnitude'],
                ['db', 'magnitude (dB)'],
                ['deg', 'phase (°)'],
                ['arg', 'phase (rad)'],
              ]}
              onChange={(part) => set({ part })}
            />
          )}
        </div>
        <Field label="Preset" title="A ready formula — conversions of spectroscopy, chemistry, engineering, the data: its formula and name written here (then change them as you like)">
          <select
            className="nodrag"
            value=""
            onChange={(e) => {
              const p = MATH_PRESETS[Number(e.target.value)];
              if (p) set({ formula: p.formula, name: p.name });
            }}
          >
            <option value="">{preset ? preset.label : 'choose a formula…'}</option>
            {[...new Set(MATH_PRESETS.map((p) => p.group))].map((g) => (
              <optgroup key={g} label={g}>
                {MATH_PRESETS.map((p, i) =>
                  p.group === g ? (
                    <option key={i} value={i}>
                      {p.label}
                    </option>
                  ) : null,
                )}
              </optgroup>
            ))}
          </select>
        </Field>
        {preset && <div className="hint">Inputs — {preset.inputs}</div>}
        <Field label="Output" title="A column (the formula row by row), or one value (a formula of single values and of whole columns: max(A) − min(A))">
          <Select<'column' | 'value'>
            value={data.output ?? 'column'}
            options={[
              ['column', 'a column (row by row)'],
              ['value', 'one value'],
            ]}
            onChange={(output) => set({ output: output === 'column' ? undefined : output })}
          />
        </Field>
        {!one && <RowRules rules={data.rules ?? []} onChange={(rules) => set({ rules })} />}
        {!one && (data.rules?.length ?? 0) > 0 && (
          <Field label="Other rows" title="The rows no rule chose: as the formula gave them, empty, or a value">
            <span className="row">
              <Select
                value={data.others ?? 'formula'}
                options={[
                  ['formula', 'from the formula'],
                  ['nan', 'empty (NaN)'],
                  ['value', 'set to'],
                ]}
                onChange={(others) => set({ others })}
              />
              {data.others === 'value' && <NumInput className="short" value={data.otherValue ?? 0} onChange={(otherValue) => set({ otherValue })} />}
            </span>
          </Field>
        )}
        <Field label="Name" title="The name of the result, with its unit if it has one: “Absorbance (a.u.)” (empty: the formula, or the name of the input when the formula is one letter)">
          <TextInput value={data.name} placeholder={data.formula || 'result'} onChange={(name) => set({ name })} />
        </Field>
        <Field label="Errors" title="The errors of the inputs, carried to the result (first order, the inputs independent: σ² = Σ (∂f/∂x · σx)²) and given on the “error” port: lines (or ; between them) — A ± 0.02, B ± 2% (of |B|), A ± C (another input: its value at the row), A ± sqrt(A)">
          <TextInput className="mono" value={data.errors ?? ''} placeholder="A ± 0.02; B ± 2%" onChange={(errors) => set({ errors: errors || undefined })} />
        </Field>
        {out && (
          <div className="hint ellipsis">
            {out.values.length} rows{r?.view.changed !== undefined ? ` (${r.view.changed} changed by the rules)` : ''}: {Array.from(out.values.slice(0, 4), (v) => fmtNum(v)).join(', ')}
            {out.values.length > 4 ? ', …' : ''}
          </div>
        )}
        {val && (
          <div className="hint ellipsis">
            = <span className="val">{fmtNum(val.value, 7)}</span>
          </div>
        )}
        <Messages result={r} />
      </NodeOptions>
      <Messages result={r} />
      {one ? <OutPort label="value" port="scalar" /> : <OutPort label="column" port="column" />}
      {withErr && <OutPort label="error" port={one ? 'scalar' : 'column'} id="err" title="The error of the result, from the errors of the inputs" />}
    </div>
  );
}

// ---- Generate column ----

// The values of a generated column (Generate column; a column added in Columns): how, and their settings — `children`
// right after the choice (Generate column: its rows)
function GenFields({ g, set, children }: { g: GenSpec; set: (p: Partial<GenSpec>) => void; children?: ReactNode }) {
  return (
    <>
      <Field label="Values">
        <Select
          value={g.mode}
          options={[
            ['linspace', 'evenly spaced: from – to'],
            ['step', 'from a start, by a step'],
            ['formula', 'formula of the row i'],
            ['random', 'random'],
          ]}
          onChange={(mode) => set({ mode })}
        />
      </Field>
      {children}
      {g.mode === 'linspace' && (
        <Field label="From – to" title="The first and the last value (both included)">
          <span className="row">
            <NumInput className="short" value={g.start} onChange={(start) => set({ start })} />–<NumInput className="short" value={g.stop} onChange={(stop) => set({ stop })} />
          </span>
        </Field>
      )}
      {g.mode === 'step' && (
        <Field label="Start, step">
          <span className="row">
            <NumInput className="short" value={g.start} onChange={(start) => set({ start })} />
            <NumInput className="short" value={g.step} onChange={(step) => set({ step })} />
          </span>
        </Field>
      )}
      {g.mode === 'formula' && (
        <div className="formula-row">
          <span className="muted">=</span>
          <AutoText className="mono" value={g.formula} placeholder="e.g. 400 + 2*(i-1), sin(2*pi*i/n)" onChange={(formula) => set({ formula })} />
        </div>
      )}
      {g.mode === 'random' && (
        <>
          <Field label="Distribution">
            <Select value={g.dist} options={[['normal', 'normal (Gaussian)'], ['uniform', 'uniform']]} onChange={(dist) => set({ dist })} />
          </Field>
          <Field label={g.dist === 'normal' ? 'Mean, SD' : 'From – to'}>
            <span className="row">
              <NumInput className="short" value={g.a} onChange={(a) => set({ a })} />
              <NumInput className="short" value={g.b} onChange={(b) => set({ b })} />
            </span>
          </Field>
          <Field label="Seed" title="The same seed gives the same numbers (reproducible); change it for another draw">
            <NumInput className="short" step={1} value={g.seed} onChange={(seed) => set({ seed })} />
          </Field>
        </>
      )}
    </>
  );
}

export function GenColNodeView({ id, data }: NodeProps<GenColNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (patch: Partial<GenColData>) => updateNodeData(id, patch);
  const r = useNodeResult(id);
  const like = useNodeConnections({ handleType: 'target', handleId: 'like' }).length > 0;
  const out = r?.outputs.out?.t === 'column' ? r.outputs.out.v : undefined;
  return (
    <div className="node node-gencol">
      <InPort label="like" port="column" id="like" title="Optional: a column whose number of rows the new column takes">
        <span className="muted">{like ? `${out?.values.length ?? '…'} rows, as this column` : 'optional: number of rows'}</span>
      </InPort>
      <NodeOptions>
      <Field label="Name" title="With its unit if it has one: “Time (s)”">
        <TextInput value={data.name} onChange={(name) => set({ name })} />
      </Field>
      <GenFields g={data} set={set}>
        {!like && (
          <Field label="Rows">
            <NumInput className="short" min={1} step={1} value={data.count} onChange={(count) => set({ count })} />
          </Field>
        )}
      </GenFields>
      {out && (
        <div className="hint ellipsis">
          {out.values.length} rows: {Array.from(out.values.slice(0, 4), (v) => fmtNum(v)).join(', ')}
          {out.values.length > 4 ? ', …' : ''}
        </div>
      )}
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label="column" port="column" />
    </div>
  );
}

// ---- Columns ----

// what “+ Column” adds
const ADD_KINDS: [ComputedKind, string][] = [
  ['formula', 'a formula'],
  ['copy', 'an input / a copy'],
  ['generate', 'generated'],
  ['value', 'one value'],
];

// The formula of a column added in Columns: written with the letters of the list (A, B …) or [names], a letter put in
// where the cursor is by a click; its first values or why not under it
function ColumnFormula({ c, lines, inputs, result, setFormula }: { c: ComputedColumn; lines: ColumnLine[]; inputs: MathInput[]; result: NodeResult | undefined; setFormula: (stored: string) => void }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const shown = formulaShown(c.formula ?? '', lines);
  const self = `=${c.id}`;
  // the cursor after the letter put in, once the text has changed
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const t = ta.current;
    if (caret.current === null || !t) return;
    t.focus();
    t.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [shown]);
  const put = (ref: string) => {
    const t = ta.current;
    const [a, b] = t && document.activeElement === t ? [t.selectionStart, t.selectionEnd] : [shown.length, shown.length];
    caret.current = a + ref.length;
    setFormula(formulaStored(shown.slice(0, a) + ref + shown.slice(b), lines));
  };
  const line = lines.find((L) => L.from === self);
  const o = result?.outputs.out;
  const col = line && o?.t === 'dataset' ? o.v.columns.find((x) => x.name === line.name) : undefined;
  const problem = line ? result?.warnings.find((w) => w.startsWith(`“${line.name}”: `)) : undefined;
  return (
    <div className="col-formula">
      <div className="formula-row">
        <span className="muted">=</span>
        <AutoText
          className="mono"
          inputRef={ta}
          value={shown}
          placeholder="e.g. B / C * 100, or [R 400 nm] / [R 410 nm] * 100"
          title="A formula of the columns, row by row: a column by its letter (A, B …) or [its name]; an input as {A}; i the row, n the rows. Moving or renaming a column keeps the formula right"
          onChange={(v) => setFormula(formulaStored(v, lines))}
        />
      </div>
      <div className="col-refs nowheel">
        {lines.map((L, k) =>
          L.from === self ? null : (
            <button key={L.from} className="nodrag" onMouseDown={(e) => e.preventDefault()} title={`Put ${lineLetter(k)} (${L.name}) in the formula`} onClick={() => put(lineLetter(k))}>
              <b>{lineLetter(k)}</b> {L.name}
            </button>
          ),
        )}
        {inputs.map((i) => (
          <button key={i.letter} className="nodrag" onMouseDown={(e) => e.preventDefault()} title={`Put {${i.letter}} (the input on port ${i.letter}) in the formula`} onClick={() => put(`{${i.letter}}`)}>
            <b>{`{${i.letter}}`}</b> {i.name}
          </button>
        ))}
      </div>
      <div className="hint">i the row, n the rows; abs sqrt exp log log10 sin cos …; mean(A) max(A) sum(A) … of a whole column.</div>
      {problem && line ? (
        <div className="hint err">{problem.slice(line.name.length + 4)}</div>
      ) : col && c.formula?.trim() ? (
        <div className="hint mono ellipsis">
          = {Array.from(col.values.slice(0, 5), (v) => (Number.isFinite(v) ? fmtNum(v, 5) : '—')).join(', ')}
          {col.values.length > 5 ? ' …' : ''}
        </div>
      ) : null}
    </div>
  );
}

type RenameHow = 'list' | 'replace' | 'affix' | 'row' | 'column';
const RENAME_LABEL: Record<RenameHow, string> = { list: 'new names, in order', replace: 'replace a text in the names', affix: 'add a text before / after', row: 'names from a row of the data', column: 'names from a column' };
const RENAME_CLEAR: Record<RenameHow, Partial<ColumnsData>> = { list: { names: undefined }, replace: { find: '', replace: '' }, affix: { prefix: '', suffix: '' }, row: { namesRow: 0 }, column: { namesFrom: undefined } };
const RENAME_HOWS = Object.keys(RENAME_LABEL) as RenameHow[];

// Rename columns in Columns: one way on screen at a time (the others set before stay on, listed under it), the
// names before → after
function RenameSeveral({ data, set, lines, head, refOptions }: { data: ColumnsData; set: (p: Partial<ColumnsData>) => void; lines: ColumnLine[]; head?: { names: string[]; rows: string[][] }; refOptions: [string, string][] }) {
  const on: Record<RenameHow, boolean> = {
    list: !!data.names?.trim(),
    replace: !!data.find,
    affix: !!(data.prefix || data.suffix),
    row: (data.namesRow ?? 0) >= 1,
    column: !!data.namesFrom?.col,
  };
  const [how, setHow] = useState<RenameHow>(() => RENAME_HOWS.find((k) => on[k]) ?? 'list');
  const also = RENAME_HOWS.filter((k) => k !== how && on[k]);
  const nf = data.namesFrom;
  const setNf = (p: Partial<NonNullable<ColumnsData['namesFrom']>>) => set({ namesFrom: { col: '', ...nf, ...p } });
  const changed = lines.filter((L) => !L.computed && !L.input && L.auto !== L.from);
  const row = data.namesRow ?? 0;
  return (
    <details className="sub">
      <summary>Rename columns</summary>
      <div className="col-form">
        <span>How</span>
        <Select<RenameHow> value={how} options={RENAME_HOWS.map((k): [RenameHow, string] => [k, RENAME_LABEL[k]])} onChange={setHow} />
        {(how === 'list' || how === 'replace' || how === 'affix') && (
          <>
            <span title="The columns these changes apply to (a name written by hand on a column wins)">Columns</span>
            <span className="row">
              <Select<NonNullable<ColumnsData['renameOn']>>
                value={data.renameOn ?? 'all'}
                options={[
                  ['all', 'all'],
                  ['y', 'the Y columns'],
                  ['list', 'the columns listed'],
                  ['ticked', 'the ones ticked above'],
                ]}
                onChange={(renameOn) => set({ renameOn: renameOn === 'all' ? undefined : renameOn })}
              />
              {data.renameOn === 'list' && <TextInput className="short-text" value={data.renameList ?? ''} placeholder="2-4, B-D" title="Columns by number, letter or name: 2-4, B-D, “R 400 nm”" onChange={(renameList) => set({ renameList })} />}
            </span>
          </>
        )}
        {how === 'list' && (
          <>
            <span title="Given in order to the columns chosen, in the order of the list">New names</span>
            <AutoText value={data.names ?? ''} placeholder="S1, S2, S3 (separated by , or ;)" onChange={(names) => set({ names: names || undefined })} />
          </>
        )}
        {how === 'replace' && (
          <>
            <span>Replace</span>
            <span className="row">
              <TextInput className="short-text" value={data.find ?? ''} placeholder="this text" onChange={(find) => set({ find })} />
              <span className="muted">with</span>
              <TextInput className="short-text" value={data.replace ?? ''} placeholder="nothing" onChange={(replace) => set({ replace })} />
            </span>
          </>
        )}
        {how === 'affix' && (
          <>
            <span>Before</span>
            <TextInput className="short-text" value={data.prefix ?? ''} placeholder="text before every name" onChange={(prefix) => set({ prefix })} />
            <span>After</span>
            <TextInput className="short-text" value={data.suffix ?? ''} placeholder="text after every name" onChange={(suffix) => set({ suffix })} />
          </>
        )}
        {how === 'row' && (
          <>
            <span>Row</span>
            <span className="row">
              <NumInput className="tiny" min={1} step={1} value={row || NaN} placeholder="none" onChange={(v) => set({ namesRow: v >= 1 ? Math.floor(v) : 0 })} />
              <span className="muted">or click it below</span>
            </span>
          </>
        )}
        {how === 'column' && (
          <>
            <span title="Its values, in order, become the names of other columns (Sample: S1, S2, S3 → the 3 columns after it)">Column</span>
            <Select<string> value={nf?.col ?? ''} options={[['', 'none'], ...refOptions.filter(([ref]) => !ref.startsWith('[='))]} onChange={(col) => set({ namesFrom: col ? { ...nf, col } : undefined })} />
            {nf?.col && (
              <>
                <span>Names of</span>
                <span className="row">
                  <Select<'others' | 'y' | 'list'>
                    value={nf.to ?? 'others'}
                    options={[
                      ['others', 'all the other columns'],
                      ['y', 'the Y columns'],
                      ['list', 'the columns listed'],
                    ]}
                    onChange={(to) => setNf({ to })}
                  />
                  {nf.to === 'list' && <TextInput className="short-text" value={nf.list ?? ''} placeholder="2-4, B-D" title="Columns by number, letter or name: 2-4, B-D, “R 400 nm”" onChange={(list) => setNf({ list })} />}
                </span>
                <span />
                <Check label="leave that column out" value={!!nf.drop} onChange={(drop) => setNf({ drop })} />
              </>
            )}
          </>
        )}
      </div>
      {how === 'row' && head && head.rows.length > 0 && (
        <>
          <div className="hint">Click the row that holds the names: it becomes the header and leaves the data.</div>
          <div className="data-scroll pick-rows nowheel nodrag">
            <table>
              <thead>
                <tr>
                  <th className="rowhead" />
                  {head.names.map((nm, j) => (
                    <th key={j}>{nm}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {head.rows.map((cells, i) => (
                  <tr key={i} className={row === i + 1 ? 'on' : ''} title={row === i + 1 ? 'These are the names (click again: none)' : `Names from row ${i + 1}`} onClick={() => set({ namesRow: row === i + 1 ? 0 : i + 1 })}>
                    <td className="rowhead">{i + 1}</td>
                    {cells.map((t, j) => (
                      <td key={j}>{t}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {also.length > 0 && (
        <div className="row wrap rename-also">
          <span className="muted">Also on:</span>
          {also.map((k) => (
            <span key={k} className="chip">
              <button className="nodrag" title="Show it" onClick={() => setHow(k)}>
                {RENAME_LABEL[k]}
              </button>
              <button className="nodrag" title="Take it off" onClick={() => set(RENAME_CLEAR[k])}>
                <X {...IC} />
              </button>
            </span>
          ))}
        </div>
      )}
      {how !== 'row' && (
        <div className="rename-preview">
          {changed.length ? (
            <>
              {changed.slice(0, 8).map((L) => (
                <div key={L.from} className="ellipsis">
                  <span className="muted">{L.from}</span> → {L.auto}
                </div>
              ))}
              {changed.length > 8 && <div className="muted">and {changed.length - 8} more</div>}
            </>
          ) : (
            <span className="muted">No name changed yet.</span>
          )}
        </div>
      )}
    </details>
  );
}

// The columns of a dataset: a row each (⠿ dragged to move it, kept or not, its name, its designation; a column added: ƒ),
// every name at once (replace, before, after; from a row of the data or from a column), the columns added (a formula of
// the others, a value, a copy) with their place; ports A, B … for columns from elsewhere.
export function ColumnsNodeView({ id, data: nodeData }: NodeProps<ColumnsNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  // every sheet of a workbook: the same settings for all, or each sheet its own (those of the sheet edited shown and
  // changed here; a sheet without its own: the common ones, until it is changed)
  const { sheet: _sheet, perSheet, sheets: ownSheets, editSheet, ...common } = nodeData;
  const every = nodeData.sheet === '*';
  const ownMode = every && perSheet === 'own';
  const sheetNames = r?.view.sheets ?? [];
  const editing = editSheet && sheetNames.includes(editSheet) ? editSheet : sheetNames[0];
  const data: ColumnsSpec = ownMode && editing ? (ownSheets?.[editing] ?? common) : nodeData;
  const set = (patch: Partial<ColumnsSpec>) => (ownMode && editing ? updateNodeData(id, { sheets: { ...ownSheets, [editing]: { ...data, ...patch } } }) : updateNodeData(id, patch));
  // the settings of the sheet edited for all of them (the common ones; no sheet with its own)
  const copyToAll = () => updateNodeData(id, { ...Object.fromEntries(COLUMNS_SPEC_KEYS.map((k) => [k, data[k]])), sheets: undefined });
  const sheetBar = every && sheetNames.length > 0 && (
    <div className="row wrap">
      <Field label="Columns" title="Every sheet with the same settings (columns matched by their names), or each sheet with its own">
        <Select<'same' | 'own'>
          value={perSheet ?? 'same'}
          options={[
            ['same', 'same for every sheet'],
            ['own', 'own for each sheet'],
          ]}
          onChange={(v) => updateNodeData(id, { perSheet: v === 'own' ? 'own' : undefined })}
        />
      </Field>
      <Field label={ownMode ? 'Editing' : 'Shown'} title={ownMode ? 'The sheet whose columns are set here (own: its own settings; common: the common ones, until changed)' : 'The sheet whose columns are listed here (the settings: of every sheet)'}>
        <Select<string> value={editing ?? ''} options={sheetNames.map((nm): [string, string] => [nm, ownMode ? `${nm} (${ownSheets?.[nm] ? 'own' : 'common'})` : nm])} onChange={(v) => updateNodeData(id, { editSheet: v })} />
      </Field>
      {ownMode && (
        <button className="nodrag" title="The settings of this sheet for every sheet (the others' own settings dropped)" onClick={copyToAll}>
          Copy to all
        </button>
      )}
    </div>
  );
  const lines = r?.view.columnLines ?? [];
  const items = data.items ?? [];
  const computed = data.computed ?? [];
  const own = (from: string) => items.find((it) => it.from === from);
  // the settings of every column in the order shown (those of columns not in the data kept after them)
  const itemsFor = (order: string[], change?: { from: string; p: Partial<ColumnItem> }) => [
    ...order.map((from) => ({ ...(own(from) ?? { from }), ...(change?.from === from ? change.p : {}) })),
    ...items.filter((it) => !order.includes(it.from)),
  ];
  const write = (order: string[], change?: { from: string; p: Partial<ColumnItem> }) => set({ items: itemsFor(order, change) });
  const names = lines.map((L) => L.from);
  const setItem = (from: string, p: Partial<ColumnItem>) => write(names, { from, p });
  const [moving, setMoving] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const move = (a: number, b: number) => {
    if (a === b) return;
    const order = [...names];
    const [x] = order.splice(a, 1);
    order.splice(b, 0, x);
    write(order);
  };
  // the ports A, B …: one free after the last one used
  const conns = useNodeConnections({ handleType: 'target' });
  const usedPorts = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const portCount = Math.max(1, Math.max(-1, maxOf(usedPorts)) + 2);
  const inputs = r?.view.inputs ?? [];
  const byPort = new Map(inputs.map((i) => [i.port, i]));
  // the columns a formula, a copy or the names may take: of the data and added ([name] as shown), the inputs ({A})
  const refOptions: [string, string][] = [...lines.map((L): [string, string] => [`[${L.from}]`, L.name]), ...inputs.map((i): [string, string] => [`{${i.letter}}`, `${i.letter}: ${i.name}`])];
  // a column added
  const setComputed = (cid: string, p: Partial<ComputedColumn>) => set({ computed: computed.map((c) => (c.id === cid ? { ...c, ...p } : c)) });
  const addComputed = (kind: ComputedKind) => {
    const n = 1 + Math.max(0, ...computed.map((c) => Number(/^c(\d+)$/.exec(c.id)?.[1] ?? 0)));
    // a column of an input: the first input not taken yet (its name, until one is written)
    const free = inputs.find((i) => i.kind === 'column' && !computed.some((q) => q.copy === `{${i.letter}}`));
    const c: ComputedColumn = {
      id: `c${n}`,
      name: kind === 'copy' ? '' : `New ${n}`,
      kind,
      ...(kind === 'formula' ? { formula: '' } : {}),
      ...(kind === 'copy' && free ? { copy: `{${free.letter}}` } : {}),
      ...(kind === 'generate' ? { gen: { ...GEN_SPEC_DEFAULTS } } : {}),
    };
    set({ computed: [...computed, c], items: itemsFor([...names, `=${c.id}`]) });
  };
  const removeComputed = (cid: string) => set({ computed: computed.filter((c) => c.id !== cid), items: items.filter((it) => it.from !== `=${cid}`) });
  // its place: at the end, after a column, or instead of one (that one left out)
  // a column's place (an added one: =id; an input's: {A}): at the end, after, before or instead of another
  const placeKey = (key: string, where: string) => {
    const order = names.filter((f) => f !== key);
    if (where === 'end') return write([...order, key]);
    const [how, target] = [where.slice(0, 1), where.slice(2)];
    const at = order.indexOf(target);
    if (at < 0) return;
    order.splice(how === 'a' ? at + 1 : at, 0, key);
    if (how === 'i') set({ items: itemsFor(order, { from: target, p: { keep: false } }) });
    else write(order);
  };
  const place = (cid: string, where: string) => placeKey(`=${cid}`, where);
  const placeOptions = (key: string): [string, string][] => [['', 'place…'], ['end', 'at the end'], ...lines.filter((L) => L.from !== key).flatMap((L): [string, string][] => [[`a:${L.from}`, `after ${L.name}`], [`b:${L.from}`, `before ${L.name}`], [`i:${L.from}`, `instead of ${L.name}`]])];
  // the columns on the ports A, B …: in the list, each with its place
  const inputLines = lines.filter((L) => L.input);
  // the columns renamed together: ticked in the list (by their names in the data)
  const picking = data.renameOn === 'ticked';
  const picked = data.renamePick ?? [];
  const setPick = (from: string, on: boolean) => set({ renamePick: on ? [...picked.filter((f) => f !== from), from] : picked.filter((f) => f !== from) });
  return (
    <div className="node node-columns">
      <InPort label="dataset" port="dataset" id="in" />
      {Array.from({ length: portCount }, (_, k) => {
        const inp = byPort.get(k);
        return (
          <InPort key={k} label={columnLetter(k)} port="column" id={`in-${k}`} title={`Optional: a column from elsewhere — a column of its own (at the end, unless placed or moved), also in a formula {${columnLetter(k)}} or giving the names; or one value (for the formulas)`}>
            <span className="muted ellipsis">{inp ? (inp.kind === 'scalar' ? `${inp.name} (one value)` : `${titleOf(inp)} · ${inp.rows} rows`) : 'a column (optional)'}</span>
          </InPort>
        );
      })}
      <NodeOptions>
      {sheetBar}
      {lines.length > 0 && (
        <div className={`columns-list${picking ? ' picking' : ''}`}>
          {lines.map((L, k) => (
            <div
              key={L.from}
              className={`columns-row${!L.keep ? ' off' : ''}${dropAt === k && moving !== null && moving !== k ? (moving < k ? ' drop-after' : ' drop-before') : ''}`}
              onDragOver={(ev) => {
                if (moving === null) return;
                ev.preventDefault();
                setDropAt(k);
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                if (moving !== null) move(moving, k);
                setMoving(null);
                setDropAt(null);
              }}
            >
              <span
                className="grip nodrag"
                draggable
                title="Drag to move the column"
                onDragStart={(ev) => {
                  ev.dataTransfer.effectAllowed = 'move';
                  ev.dataTransfer.setData('text/plain', L.from);
                  setMoving(k);
                }}
                onDragEnd={() => {
                  setMoving(null);
                  setDropAt(null);
                }}
              >
                {L.computed ? 'ƒ' : L.input ? L.from.slice(1, -1) : '⠿'}
              </span>
              <span className="col-letter" title={`Its letter in the formulas: ${lineLetter(k)}`}>
                {lineLetter(k)}
              </span>
              <input className="nodrag" type="checkbox" checked={L.keep} title="Kept (untick: left out — a formula may still use it)" onChange={(e) => setItem(L.from, { keep: e.target.checked ? undefined : false })} />
              {picking && (L.computed ? <span /> : <input className="nodrag pick" type="checkbox" checked={picked.includes(L.from)} title="Renamed with the others ticked (Rename columns)" onChange={(e) => setPick(L.from, e.target.checked)} />)}
              {L.computed ? (
                <TextInput value={computed.find((c) => `=${c.id}` === L.from)?.name ?? L.name} placeholder={L.name} title="The name of the column added (its settings below)" onChange={(name) => setComputed(L.from.slice(1), { name })} />
              ) : (
                <TextInput value={own(L.from)?.name ?? ''} placeholder={L.auto} title={`Its name (empty: “${L.auto}”); in the data: “${L.from}”`} onChange={(name) => setItem(L.from, { name: name || undefined })} />
              )}
              <Select<ColumnRole> value={L.role} options={[...ROLE_OPTIONS, ['none', '–']]} title="Its designation (what a quick plot does with it)" onChange={(role) => setItem(L.from, { role })} />
              <span className="muted" title="Rows">
                {L.rows}
              </span>
            </div>
          ))}
        </div>
      )}
      {inputLines.map((L) => (
        <div key={L.from} className="row" title="A column connected to this port: a column of its own (untick it in the list to leave it out; a formula can still use it)">
          <span className="muted ellipsis grow">
            {L.from.slice(1, -1)} · {L.name}
          </span>
          <Select<string> value="" title="Its place among the columns (then drag it in the list)" options={placeOptions(L.from)} onChange={(w) => w && placeKey(L.from, w)} />
        </div>
      ))}
      <div className="row">
        <Select<ComputedKind | ''>
          value=""
          title="A column added: a formula of the columns; a column of an input (A, B …) or a copy of a column; generated values (evenly spaced, by a step, of the row i, random — as many rows as the data); one value in every row"
          options={[['', '+ Column…'], ...ADD_KINDS]}
          onChange={(k) => k && lines.length > 0 && addComputed(k)}
        />
        <button className="nodrag" disabled={!items.length} title="Every column back as it comes: its name, designation, place, kept (the columns added stay)" onClick={() => set({ items: items.filter((it) => it.from.startsWith('=')) })}>
          <RotateCcw {...IC} /> Reset the columns
        </button>
      </div>
      {computed.map((c) => {
        const kind = c.kind ?? 'formula';
        const line = lines.find((L) => L.from === `=${c.id}`);
        return (
          <div key={c.id} className="col-added">
            <div className="row">
              <b className="ellipsis">ƒ {line?.name ?? (c.name || 'Column')}</b>
              <button className="nodrag ts-btn" title="Remove this column" onClick={() => removeComputed(c.id)}>
                <X {...IC} />
              </button>
            </div>
            <div className="row">
              <Select<ComputedKind>
                value={kind}
                options={[
                  ['formula', 'formula'],
                  ['copy', 'a column (input / copy)'],
                  ['generate', 'generated'],
                  ['value', 'one value'],
                ]}
                onChange={(k) => setComputed(c.id, { kind: k, ...(k === 'generate' && !c.gen ? { gen: { ...GEN_SPEC_DEFAULTS } } : {}) })}
              />
              <Select<string>
                value=""
                title="Its place among the columns (then drag ƒ in the list)"
                options={placeOptions(`=${c.id}`)}
                onChange={(w) => w && place(c.id, w)}
              />
            </div>
            {kind === 'formula' && <ColumnFormula c={c} lines={lines} inputs={inputs} result={r} setFormula={(formula) => setComputed(c.id, { formula })} />}
            {kind === 'value' && (
              <Field label="Value" title="The same number in every row">
                <NumInput className="short" value={c.value ?? NaN} onChange={(value) => setComputed(c.id, { value })} />
              </Field>
            )}
            {kind === 'generate' && <GenFields g={{ ...GEN_SPEC_DEFAULTS, ...c.gen }} set={(p) => setComputed(c.id, { gen: { ...c.gen, ...p } })} />}
            {kind === 'generate' && line && <div className="hint">{line.rows} rows, as the data.</div>}
            {kind === 'copy' && (
              <Field label="Column" title="A column of an input (A, B …), or of the data to copy; the name is its own until you write one">
                <Select<string> value={c.copy ?? ''} options={[['', '—'], ...refOptions.filter(([ref]) => ref !== `[=${c.id}]`)]} onChange={(copy) => setComputed(c.id, { copy: copy || undefined })} />
              </Field>
            )}
          </div>
        );
      })}
      <RenameSeveral data={data} set={set} lines={lines} head={r?.view.columnsHead} refOptions={refOptions} />
      </NodeOptions>
      <ResultSummary result={r} />
      <Messages result={r} />
      <OutPort label={every ? 'workbook' : 'dataset'} port={every ? 'workbook' : 'dataset'} title={every ? 'Every sheet with its columns set: a workbook' : undefined} />
      <OutPort label="names (a column)" port="column" id="names" title="The names of the columns kept, as a text column (its values: the blocks' values of columns made by Split into columns)" />
    </div>
  );
}

// ---- Auto-extract ----

export function AutoExtractNodeView({ id, data }: NodeProps<AutoExtractNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (patch: Partial<AutoExtractData>) => updateNodeData(id, patch);
  const setRule = (k: number, p: Partial<ExtractRule>) => set({ rules: data.rules.map((x, j) => (j === k ? { ...x, ...p } : x)) });
  const cols = r?.view.available ?? [];
  const sheets = r?.view.sheets ?? [];
  const simple = data.mode === 'simple';
  const picked = data.pick ?? sheets;
  const tick = (name: string, on: boolean) => set({ pick: sheets.filter((s) => (s === name ? on : picked.includes(s))) });
  const ex = r?.view.extractCols;
  const setRole = (j: number, role: ColumnRole) => {
    const rs = [...(data.roles ?? [])];
    while (rs.length <= j) rs.push(null);
    rs[j] = role;
    set({ roles: rs });
  };
  return (
    <div className="node node-autoextract">
      <InPort label="workbook" port="workbook" id="in" title="A workbook (Import with a spreadsheet file or several files), or a dataset">
        <span className="muted ellipsis" title={sheets.join(', ')}>
          {sheets.length ? `${sheets.length} sheet${sheets.length > 1 ? 's' : ''}: ${sheets.join(', ')}` : ''}
        </span>
      </InPort>
      <NodeOptions>
      <div className="row wrap">
        <Select<'simple' | 'rules'>
          value={simple ? 'simple' : 'rules'}
          title="Simple: tick the sheets, say what every column is. Rules: lists and patterns of sheets and columns (custom)"
          options={[
            ['simple', 'simple: sheets and columns'],
            ['rules', 'rules (custom)'],
          ]}
          onChange={(m) => set({ mode: m })}
        />
      </div>
      {simple && (
        <>
          <div className="row wrap">
            <span className="muted">Sheets</span>
            <button className="nodrag ts-btn" onClick={() => set({ pick: undefined })}>
              All
            </button>
            <button className="nodrag ts-btn" onClick={() => set({ pick: [] })}>
              None
            </button>
          </div>
          <div className="row wrap sheet-ticks">
            {sheets.map((s) => (
              <Check key={s} label={s} value={picked.includes(s)} onChange={(on) => tick(s, on)} />
            ))}
          </div>
          {ex && ex.columns.length > 0 && (
            <>
              <div className="muted" title="The same columns are taken from every sheet ticked (by their place)">
                Columns (as in “{ex.sheet}”)
              </div>
              <div className="col-form">
                {ex.columns.map((c, j) => (
                  <Fragment key={j}>
                    <span className="ellipsis" title={c.name}>
                      {columnLetter(j)} · {c.name}
                    </span>
                    <Select<ColumnRole> value={c.role} options={[...ROLE_OPTIONS, ['none', '– not taken']]} onChange={(role) => setRole(j, role)} />
                  </Fragment>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {!simple && (
      <div className="rules">
        <div className="rule head">
          <span>Sheets</span>
          <span>Columns</span>
          <span>As</span>
          <span />
        </div>
        {data.rules.map((x, k) => (
          <div key={k} className="rule">
            <TextInput value={x.sheets} placeholder="* (all)" title="Sheets: 1, 3-5, a name, run* (a pattern), * all, !2 not" onChange={(sheets) => setRule(k, { sheets })} />
            <TextInput value={x.columns} placeholder="e.g. 2, 5 or B or Absorbance" title="Columns: 1, 3-5, 2-end, B, D-F, a name, abs* (a pattern), * all, !1 not" onChange={(columns) => setRule(k, { columns })} />
            <Select value={x.role} options={ROLE_OPTIONS} title="What the columns are (their designation)" onChange={(role) => setRule(k, { role })} />
            <button className="nodrag ts-btn" title="Remove this rule" onClick={() => set({ rules: data.rules.filter((_, j) => j !== k) })}>
              <X {...IC} />
            </button>
          </div>
        ))}
      </div>
      )}
      <div className="row wrap">
        {!simple && (
          <button className="nodrag" onClick={() => set({ rules: [...data.rules, { sheets: '*', columns: '', role: 'y' }] })}>
            + Rule
          </button>
        )}
        <Field label="Names" title="How the columns taken are named">
          <Select<ExtractNames>
            value={data.names}
            options={[
              ['sheet', 'Y by its sheet'],
              ['sheet-column', 'sheet: column'],
              ['column', 'the column’s'],
            ]}
            onChange={(names) => set({ names })}
          />
        </Field>
      </div>
      {!simple && <div className="hint">Sheets and columns: 1, 3-5, 2-end · B, D-F · a name · run* · * all · !3 not. In each sheet the columns keep their order: a Y goes with the X on its left, a ±Y with its Y.</div>}
      </NodeOptions>
      {cols.length > 0 && (
        <div className="extracted nowheel">
          {cols.map((c, k) => (
            <span key={k} className="chip" title={`${titleOf(c)} · ${c.rows} rows`}>
              <b>{ROLE_LABELS[c.role ?? 'y']}</b> {c.name}
            </span>
          ))}
        </div>
      )}
      <Messages result={r} />
      <OutPort label={`dataset (${cols.length} columns)`} port="dataset" title="The columns taken, with their designations: Plot ▸ Curves from the columns ▸ From the designations, or right-click ▸ Plot these columns" />
    </div>
  );
}
