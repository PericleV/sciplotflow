// The matrix nodes: Matrix (typed in a grid of cells, generated, or from the columns of a dataset), Matrix computation
// (steps, each an operation on the inputs or on the results above it, each result on its own port); a matrix is drawn by
// Contour / heatmap (its matrix port).
import { Fragment, useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import type { MatrixInfo } from '../engine/evaluate.ts';
import { columnLetter } from '../engine/csv.ts';
import { fmtCell, numberB, OP_GROUPS, OP_LABEL, stepName, stepParts, takesB, partHandle, type Along, type ElemFn, type MatGen, type MatOp, type MatSource, type MatStep, type NormKind, type ReduceFn } from '../engine/matrix.ts';
import { maxOf } from '../engine/minmax.ts';
import type { AppNode, MatCompData, MatCompNode, MatrixNode } from '../types.ts';
import { ColumnsPicker } from './ColumnsPicker.tsx';
import { RowSelectControls } from './StatsNodes.tsx';
import { pasteSplitter } from '../engine/sheet.ts';
import { sizeText } from './matrixText.ts';
import { AutoText, Field, InPort, Messages, NumInput, OutPort, Select, TextInput } from './ui.tsx';
import { NodeOptions } from './NodeOptions.tsx';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { IC } from './iconProps.ts';

// ---- the preview of a matrix: its top-left corner, the names (or X, Y) of its columns and rows ----
export function MatrixPreview({ info }: { info: MatrixInfo }) {
  const colHead = (j: number) => info.colNames?.[j] ?? (info.xs ? fmtCell(info.xs[j]) : String(j + 1));
  const rowHead = (i: number) => info.rowNames?.[i] || (info.ys ? fmtCell(info.ys[i]) : String(i + 1));
  const more = { r: info.rows > info.shownRows, c: info.cols > info.shownCols };
  return (
    <div className="matrix-preview nowheel">
      <table>
        <thead>
          <tr>
            <th />
            {Array.from({ length: info.shownCols }, (_, j) => (
              <th key={j} title={colHead(j)}>
                {colHead(j)}
              </th>
            ))}
            {more.c && <th>…</th>}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: info.shownRows }, (_, i) => (
            <tr key={i}>
              <th title={rowHead(i)}>{rowHead(i)}</th>
              {Array.from({ length: info.shownCols }, (_, j) => (
                <td key={j}>{fmtCell(info.cells[i * info.shownCols + j])}</td>
              ))}
              {more.c && <td>…</td>}
            </tr>
          ))}
          {more.r && (
            <tr>
              <th>⋮</th>
              {Array.from({ length: info.shownCols + (more.c ? 1 : 0) }, (_, j) => (
                <td key={j}>⋮</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- the cells typed: a grid of inputs over the text (a line a row, tab-separated) ----
const MAX_ROWS_SHOWN = 40;
const MAX_COLS_SHOWN = 20;
// (every line a row, the empty ones too: a row just added is empty)
function cellsOf(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n');
  const rows = lines.map((l) => l.split('\t'));
  const w = Math.max(1, maxOf(rows.map((r) => r.length)));
  return rows.map((r) => Array.from({ length: w }, (_, j) => r[j] ?? ''));
}
const textOf = (cells: string[][]) => cells.map((r) => r.join('\t')).join('\n');

function MatrixCells({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const cells = cellsOf(text);
  const [m, n] = [cells.length, cells[0]?.length ?? 1];
  const box = useRef<HTMLDivElement>(null);
  const focus = (i: number, j: number) => box.current?.querySelector<HTMLInputElement>(`input[data-cell="${i}:${j}"]`)?.focus();
  // the cell to go to once it is drawn (Enter on the last row: the row added first)
  const pending = useRef<[number, number] | null>(null);
  useEffect(() => {
    const p = pending.current;
    if (p && box.current?.querySelector(`input[data-cell="${p[0]}:${p[1]}"]`)) {
      pending.current = null;
      focus(p[0], p[1]);
    }
  });
  const setCell = (i: number, j: number, v: string) => onChange(textOf(cells.map((r, a) => (a === i ? r.map((c, b) => (b === j ? v : c)) : r))));
  const resize = (rows: number, cols: number) => onChange(textOf(Array.from({ length: Math.max(1, rows) }, (_, i) => Array.from({ length: Math.max(1, cols) }, (_, j) => cells[i]?.[j] ?? ''))));
  // a block pasted from a spreadsheet or a text file: from this cell, the matrix made larger when needed
  const paste = (e: ClipboardEvent<HTMLInputElement>, i0: number, j0: number) => {
    const t = e.clipboardData.getData('text/plain');
    if (!/[\t\n;,\s]/.test(t.trim())) return;
    e.preventDefault();
    const lines = t.replace(/\r/g, '').split('\n').filter((l, k, a) => l.trim() || k < a.length - 1);
    const split = pasteSplitter(lines);
    const block = lines.map((l) => split(l).map((c) => c.trim()));
    const rows = Math.max(m, i0 + block.length);
    const cols = Math.max(n, j0 + maxOf(block.map((b) => b.length)));
    const next = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => block[i - i0]?.[j - j0] ?? cells[i]?.[j] ?? ''));
    onChange(textOf(next));
  };
  const key = (e: KeyboardEvent<HTMLInputElement>, i: number, j: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (i + 1 >= m) {
        pending.current = [i + 1, j];
        resize(m + 1, n);
      } else focus(i + 1, j);
    } else if (e.key === 'ArrowDown' && i + 1 < m) focus(i + 1, j);
    else if (e.key === 'ArrowUp' && i > 0) focus(i - 1, j);
  };
  const [sr, sc] = [Math.min(m, MAX_ROWS_SHOWN), Math.min(n, MAX_COLS_SHOWN)];
  return (
    <div className="matrix-typed">
      <div className="matrix-cells nowheel" ref={box}>
        <table>
          <thead>
            <tr>
              <th />
              {Array.from({ length: sc }, (_, j) => (
                <th key={j}>{j + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: sr }, (_, i) => (
              <tr key={i}>
                <th>{i + 1}</th>
                {Array.from({ length: sc }, (_, j) => (
                  <td key={j}>
                    <input className="nodrag" data-cell={`${i}:${j}`} value={cells[i][j]} spellCheck={false} onChange={(e) => setCell(i, j, e.target.value)} onPaste={(e) => paste(e, i, j)} onKeyDown={(e) => key(e, i, j)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(m > sr || n > sc) && <div className="hint">Shown: the first {sr} × {sc} cells (the matrix is {m} × {n}; paste to change the others).</div>}
      <span className="row wrap">
        <span className="muted">
          {m} × {n}
        </span>
        <button className="nodrag ts-btn" title="A row more" onClick={() => resize(m + 1, n)}>
          + Row
        </button>
        <button className="nodrag ts-btn" title="The last row out" disabled={m <= 1} onClick={() => resize(m - 1, n)}>
          − row
        </button>
        <button className="nodrag ts-btn" title="A column more" onClick={() => resize(m, n + 1)}>
          + Column
        </button>
        <button className="nodrag ts-btn" title="The last column out" disabled={n <= 1} onClick={() => resize(m, n - 1)}>
          − column
        </button>
        <button className="nodrag ts-btn" title="Every cell emptied (the size kept)" onClick={() => onChange(textOf(cells.map((r) => r.map(() => ''))))}>
          Clear
        </button>
      </span>
    </div>
  );
}

// ---- Matrix ----
export function MatrixNodeView({ id, data: d }: NodeProps<MatrixNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<MatSource>) => updateNodeData(id, p);
  const info = r?.view.matrix;
  const names = (r?.view.available ?? []).map((c) => c.name);
  const sq = d.gen === 'identity' || d.gen === 'hilbert';
  return (
    <div className="node node-matrix">
      <InPort label="dataset" port="dataset" id="in" title="From a dataset: its columns (chosen) become the matrix's columns">
        <span className="muted">{d.source === 'dataset' ? (names.length ? `${names.length} columns` : 'connect a dataset') : 'only for “from a dataset”'}</span>
      </InPort>
      <NodeOptions>
      <div className="col-form">
        <span>Name</span>
        <TextInput value={d.name} placeholder="M" onChange={(name) => set({ name })} />
        <span>Matrix</span>
        <Select<MatSource['source']>
          value={d.source}
          options={[
            ['typed', 'typed in the cells'],
            ['generated', 'generated'],
            ['dataset', 'from a dataset'],
          ]}
          onChange={(source) => set({ source })}
        />
        {d.source === 'generated' && (
          <>
            <span>Kind</span>
            <Select<MatGen>
              value={d.gen}
              options={[
                ['identity', 'identity I'],
                ['zeros', 'zeros'],
                ['ones', 'ones'],
                ['constant', 'a constant'],
                ['diagonal', 'diagonal (the values)'],
                ['random', 'random'],
                ['formula', 'formula of i, j'],
                ['hilbert', 'Hilbert 1/(i + j − 1)'],
                ['vandermonde', 'Vandermonde (the values)'],
                ['rotation', 'rotation 2D (an angle)'],
              ]}
              onChange={(gen) => set({ gen })}
            />
            {d.gen !== 'diagonal' && d.gen !== 'rotation' && (
              <>
                <span>{sq ? 'Size' : d.gen === 'vandermonde' ? 'Columns' : 'Rows × columns'}</span>
                <span className="row">
                  {d.gen !== 'vandermonde' && <NumInput className="tiny" min={1} step={1} value={d.rows} onChange={(rows) => set({ rows })} />}
                  {!sq && (
                    <>
                      {d.gen !== 'vandermonde' && '×'}
                      <NumInput className="tiny" min={1} step={1} value={d.cols} placeholder={d.gen === 'vandermonde' ? 'n' : ''} title={d.gen === 'vandermonde' ? 'The powers n − 1 … 0 (empty: as many as the values)' : undefined} onChange={(cols) => set({ cols })} />
                    </>
                  )}
                </span>
              </>
            )}
            {d.gen === 'constant' && (
              <>
                <span>Value</span>
                <NumInput className="short" value={d.value} onChange={(value) => set({ value })} />
              </>
            )}
            {(d.gen === 'diagonal' || d.gen === 'vandermonde') && (
              <>
                <span>Values</span>
                <TextInput value={d.list} placeholder="1, 2, 3" onChange={(list) => set({ list })} />
              </>
            )}
            {d.gen === 'rotation' && (
              <>
                <span>Angle (°)</span>
                <NumInput className="short" value={d.angle} onChange={(angle) => set({ angle })} />
              </>
            )}
            {d.gen === 'random' && (
              <>
                <span>Distribution</span>
                <span className="row wrap">
                  <Select value={d.dist} options={[['normal', 'normal (Gaussian)'], ['uniform', 'uniform']]} onChange={(dist) => set({ dist })} />
                  <NumInput className="tiny" value={d.a} title={d.dist === 'normal' ? 'Mean' : 'From'} onChange={(a) => set({ a })} />
                  <NumInput className="tiny" value={d.b} title={d.dist === 'normal' ? 'SD' : 'To'} onChange={(b) => set({ b })} />
                  <Field label="Seed" title="The same seed gives the same numbers">
                    <NumInput className="tiny" step={1} value={d.seed} onChange={(seed) => set({ seed })} />
                  </Field>
                </span>
              </>
            )}
            {d.gen === 'formula' && (
              <>
                <span>f(i, j) =</span>
                <AutoText className="mono" value={d.formula} placeholder="e.g. 1/(i + j - 1), sin(i)*j, (i == j)*2" title="i, j: the row and the column (from 1); m, n: the rows and columns" onChange={(formula) => set({ formula })} />
              </>
            )}
          </>
        )}
        {d.source === 'dataset' && (
          <>
            <span>Columns</span>
            <ColumnsPicker value={d.zs} names={names} auto="auto: every column with numbers" title="The columns of the matrix (auto: all with numbers but the rows' Y and the labels)" onChange={(zs) => set({ zs })} />
            <span>Rows' Y</span>
            <Select
              value={d.rowAt}
              title="The Y of every row (kept by the matrix: Contour ▸ Matrix ▸ Axes from ▸ X and Y)"
              options={[['', 'auto: the column designated X'], ['-', 'none (the row numbers)'], ...names.map((x): [string, string] => [x, x])]}
              onChange={(rowAt) => set({ rowAt })}
            />
            <span>Columns' X</span>
            <Select<MatSource['colAt']>
              value={d.colAt}
              options={[
                ['auto', 'auto: the numbers in their names, if all have one'],
                ['names', 'the numbers in their names (R 400 nm → 400)'],
                ['index', 'none (the column numbers)'],
              ]}
              onChange={(colAt) => set({ colAt })}
            />
          </>
        )}
      </div>
      {d.source === 'dataset' && <RowSelectControls value={d.rowSel} onChange={(rowSel) => set({ rowSel })} hasX={!!names.length} result={r} />}
      </NodeOptions>
      {d.source === 'typed' && <MatrixCells text={d.text} onChange={(text) => set({ text })} />}
      {info && d.source !== 'typed' && (
        <>
          <div className="hint">{sizeText(info)}</div>
          <MatrixPreview info={info} />
        </>
      )}
      <Messages result={r} />
      <OutPort label="matrix" port="matrix" title="The matrix: to Matrix computation, Contour / heatmap" />
      <OutPort label="dataset" port="dataset" id="dataset" title="The matrix as a table: the rows' Y (designated X), then a column a matrix column (named by its X): for a Workbook, 1D plot, Contour" />
    </div>
  );
}

// ---- Matrix computation ----
const FUNCS: [ElemFn, string][] = [
  ['abs', '|a|'],
  ['neg', '−a'],
  ['recip', '1/a'],
  ['exp', 'exp(a)'],
  ['ln', 'ln(a)'],
  ['log10', 'log10(a)'],
  ['sqrt', '√a'],
  ['square', 'a²'],
  ['round', 'round(a)'],
];
const NORMS: [NormKind, string][] = [
  ['fro', 'Frobenius'],
  ['1', '1 (largest column sum)'],
  ['inf', '∞ (largest row sum)'],
  ['2', '2 (largest σ)'],
  ['max', 'largest |a|'],
];
const REDUCERS: [ReduceFn, string][] = [
  ['sum', 'sum'],
  ['mean', 'mean'],
  ['min', 'min'],
  ['max', 'max'],
  ['prod', 'product'],
];

function OpSelect({ value, onChange }: { value: MatOp; onChange: (op: MatOp) => void }) {
  return (
    <select className="nodrag matop" value={value} onChange={(e) => onChange(e.target.value as MatOp)}>
      {OP_GROUPS.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.ops.map(([op, label]) => (
            <option key={op} value={op}>
              {label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function MatCompNodeView({ id, data: d }: NodeProps<MatCompNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const r = useNodeResult(id);
  const set = (p: Partial<MatCompData>) => updateNodeData(id, p);
  const conns = useNodeConnections({ handleType: 'target' });
  // one free port after the last one used
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, maxOf(used)) + 2);
  const byPort = new Map((r?.view.matInputs ?? []).map((i) => [i.port, i]));
  const views = new Map((r?.view.matSteps ?? []).map((s) => [s.id, s]));
  const steps = d.steps;
  const setStep = (sid: string, p: Partial<MatStep>) => set({ steps: steps.map((s) => (s.id === sid ? { ...s, ...p } : s)) });
  const letters = Array.from({ length: Math.max(1, count - 1) }, (_, k) => columnLetter(k));
  // what a step can take: the inputs, and every result of the steps above it
  const operands = (k: number): [string, string][] => [
    ...letters.map((l): [string, string] => [l, byPort.get(letters.indexOf(l)) ? `${l} (${byPort.get(letters.indexOf(l))!.rows} × ${byPort.get(letters.indexOf(l))!.cols})` : l]),
    ...steps.slice(0, k).flatMap((s, q) => stepParts(s).map((p): [string, string] => [p.key ? `@${s.id}.${p.key}` : `@${s.id}`, p.label ? `${stepName(s, q)} · ${p.label}` : stepName(s, q)])),
  ];
  const addStep = () => {
    let n = steps.length + 1;
    while (steps.some((s) => s.id === `s${n}`)) n++;
    const last = steps[steps.length - 1];
    const a = last ? (stepParts(last)[0].key ? `@${last.id}.${stepParts(last)[0].key}` : `@${last.id}`) : 'A';
    set({ steps: [...steps, { id: `s${n}`, op: 'transpose', a }] });
  };
  const move = (k: number, by: number) => {
    const next = [...steps];
    const [s] = next.splice(k, 1);
    next.splice(k + by, 0, s);
    set({ steps: next });
  };
  return (
    <div className="node node-matcomp">
      {Array.from({ length: count }, (_, k) => {
        const inp = byPort.get(k);
        return (
          <InPort key={k} label={columnLetter(k)} port="matrix" id={`in-${k}`} title="A matrix, a column (a vector n × 1) or a single value">
            <span className="muted ellipsis">{inp ? (inp.kind === 'scalar' ? `${inp.name} (one value)` : `${inp.name} · ${inp.rows} × ${inp.cols}${inp.kind === 'column' ? ' (a column)' : ''}`) : 'connect a matrix, column or value'}</span>
          </InPort>
        );
      })}
      {/* in the node: every step's results and their ports; the steps edited in the panel */}
      <div className="mat-steps">
        {steps.map((s, k) => {
          const v = views.get(s.id);
          return (
            <div className="mat-step" key={s.id}>
              <div className="row mat-step-head ellipsis" title={OP_LABEL[s.op]}>
                <b>{v?.name ?? stepName(s, k)}</b>
                <span className="muted ellipsis">
                  = {OP_LABEL[s.op]} · {[s.a, takesB(s.op) ? (s.b === '#' ? String(s.num ?? '') : s.b) : undefined].filter(Boolean).join(', ')}
                </span>
              </div>
              {v?.error && <div className="msg err">{v.error}</div>}
              {v?.warnings.map((w) => (
                <div className="msg warn" key={w}>
                  {w}
                </div>
              ))}
              {v &&
                !v.error &&
                v.parts.map((p) => (
                  <Fragment key={p.key}>
                    <OutPort label={p.label ? `${v.name} · ${p.label}` : v.name} port={p.info ? 'matrix' : 'scalar'} id={partHandle(s.id, p.key)} title={OP_LABEL[s.op]}>
                      <span className="mat-result">{p.info ? `${p.info.rows} × ${p.info.cols}` : fmtCell(p.value ?? NaN)}</span>
                    </OutPort>
                    {p.info && <MatrixPreview info={p.info} />}
                  </Fragment>
                ))}
            </div>
          );
        })}
      </div>
      <NodeOptions>
        <div className="mat-steps">
          {steps.map((s, k) => {
            const v = views.get(s.id);
            const ops = operands(k);
            const opts = (ref: string | undefined): [string, string][] => (ref && !ops.some(([x]) => x === ref) && ref !== '#' ? [[ref, `${ref} (gone)`], ...ops] : ops);
            return (
              <div className="mat-step" key={s.id}>
                <div className="row wrap mat-step-head">
                  <TextInput className="mat-name" value={s.name ?? ''} placeholder={`R${k + 1}`} title="The name of the result (empty: R1, R2 … by its place)" onChange={(name) => setStep(s.id, { name })} />
                  <span className="muted">=</span>
                  <OpSelect value={s.op} onChange={(op) => setStep(s.id, { op, ...(takesB(op) && !s.b ? { b: numberB(op) ? '#' : 'B', num: s.num ?? 2 } : {}) })} />
                  <span className="grow" />
                  <button className="nodrag ts-btn" title="Up" disabled={k === 0} onClick={() => move(k, -1)}>
                    <ArrowUp {...IC} />
                  </button>
                  <button className="nodrag ts-btn" title="Down" disabled={k === steps.length - 1} onClick={() => move(k, 1)}>
                    <ArrowDown {...IC} />
                  </button>
                  <button className="nodrag ts-btn" title="Remove the step" onClick={() => set({ steps: steps.filter((q) => q.id !== s.id) })}>
                    <X {...IC} />
                  </button>
                </div>
                <div className="row wrap mat-step-args">
                  <Field label="A">
                    <Select value={s.a} options={opts(s.a)} onChange={(a) => setStep(s.id, { a })} />
                  </Field>
                  {takesB(s.op) && (
                    <Field label="B">
                      <Select value={s.b ?? ''} options={[...(s.op === 'formula' ? ([['', 'none']] as [string, string][]) : []), ...opts(s.b), ...(numberB(s.op) ? ([['#', 'a number']] as [string, string][]) : [])]} onChange={(b) => setStep(s.id, { b })} />
                      {s.b === '#' && <NumInput className="tiny" value={s.num ?? NaN} onChange={(num) => setStep(s.id, { num })} />}
                    </Field>
                  )}
                  {s.op === 'func' && <Select<ElemFn> value={(s.fn as ElemFn) ?? 'abs'} options={FUNCS} onChange={(fn) => setStep(s.id, { fn })} />}
                  {s.op === 'norm' && <Select<NormKind> value={(s.fn as NormKind) ?? 'fro'} options={NORMS} onChange={(fn) => setStep(s.id, { fn })} />}
                  {s.op === 'matpow' && (
                    <Field label="n" title="A whole number; negative: a power of the inverse">
                      <NumInput className="tiny" step={1} value={s.k ?? 2} onChange={(k2) => setStep(s.id, { k: k2 })} />
                    </Field>
                  )}
                  {s.op === 'rot90' && <Select<number> value={s.k ?? 1} options={[[1, '90° ⟲'], [2, '180°'], [3, '90° ⟳']]} onChange={(k2) => setStep(s.id, { k: k2 })} />}
                  {s.op === 'flip' && <Select<'lr' | 'ud'> value={s.how ?? 'lr'} options={[['lr', '↔ left – right'], ['ud', '↕ up – down']]} onChange={(how) => setStep(s.id, { how })} />}
                  {s.op === 'reshape' && (
                    <Field label="r × c" title="Row by row">
                      <NumInput className="tiny" min={1} step={1} value={s.r ?? NaN} onChange={(r2) => setStep(s.id, { r: r2 })} />×<NumInput className="tiny" min={1} step={1} value={s.c ?? NaN} onChange={(c) => setStep(s.id, { c })} />
                    </Field>
                  )}
                  {s.op === 'part' && (
                    <>
                      <Field label="Rows" title="1-3, 5, 2-end (empty: all)">
                        <TextInput className="short" value={s.rows ?? ''} placeholder="all" onChange={(rows) => setStep(s.id, { rows })} />
                      </Field>
                      <Field label="Columns" title="1-3, 5, 2-end (empty: all)">
                        <TextInput className="short" value={s.cols ?? ''} placeholder="all" onChange={(cols) => setStep(s.id, { cols })} />
                      </Field>
                    </>
                  )}
                  {s.op === 'reduce' && (
                    <>
                      <Select<ReduceFn> value={(s.fn as ReduceFn) ?? 'sum'} options={REDUCERS} onChange={(fn) => setStep(s.id, { fn })} />
                      <Select<Along>
                        value={s.along ?? 'columns'}
                        options={[
                          ['columns', 'of every column (a row)'],
                          ['rows', 'of every row (a column)'],
                          ['all', 'of all (a value)'],
                        ]}
                        onChange={(along) => setStep(s.id, { along })}
                      />
                    </>
                  )}
                </div>
                {s.op === 'formula' && (
                  <div className="formula-row">
                    <span className="muted">f =</span>
                    <AutoText className="mono" value={s.formula ?? ''} placeholder="e.g. a*b + 1, (i == j)*a, a^2 - b" title="a, b: the elements of A and B; i, j: the row and the column (from 1); m, n: the rows and columns" onChange={(formula) => setStep(s.id, { formula })} />
                  </div>
                )}
                {v?.error && <div className="msg err">{v.error}</div>}
              </div>
            );
          })}
        </div>
        <span className="row wrap">
          <button className="nodrag" title="One operation more, on the inputs or the results above" onClick={addStep}>
            + Step
          </button>
        </span>
      </NodeOptions>
      {r && !r.errors.length && r.view.waiting && <div className="hint">{r.view.waiting}</div>}
    </div>
  );
}
