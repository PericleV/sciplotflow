// Inspect: the data a node gives (every output, a tab each) or a connection carries, in the options panel, without
// making a workbook: a table with its columns (name, designation), as many rows as chosen, scrolling both ways with
// its head and the row numbers kept in view (only the rows in view drawn, so long tables stay quick); a sheet of a
// workbook chosen; a matrix as its cells; a value; a figure by its size. Large: the same over the whole window.
import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Edge } from '@xyflow/react';
import type { NodeResult, Value } from './engine/evaluate.ts';
import { cellText, fmtNum, roleOf, type Column } from './engine/table.ts';
import { portNames } from './engine/batch.ts';
import { nodeColor, nodeDisplayName } from './nodeColors.ts';
import { PinIcon } from './nodes/icons.tsx';
import type { AppNode, GroupData } from './types.ts';
import { ChevronDown, ChevronRight, Maximize2, X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';

// what is inspected: a node (all its outputs) or a connection (what it carries); pinned: kept while others are chosen
export type DataTarget = { kind: 'node' | 'edge'; id: string; pinned?: boolean };

const ROW_H = 20;
const ROWS = [10, 50, 200, 1000, Infinity];
const ROLE: Record<string, string> = { x: 'X', y: 'Y', z: 'Z', xerr: '±X', yerr: '±Y', label: 'Label', none: '–' };

// the name of an output: its handle; of a Batch, as its ports say (all rows, the kept results by their names)
function outputName(node: AppNode | undefined, handle: string): string {
  if (node?.type === 'subgraph' && handle === 'stacked') return 'all rows';
  const m = /^k-(.+)$/.exec(handle);
  if (m && node?.type === 'subgraph') {
    const outs = (node.data as GroupData).outputs;
    const k = outs.findIndex((p) => p.id === m[1]);
    if (k >= 0) return portNames(outs)[k];
  }
  return handle;
}

// a table of columns: the head (name, designation) and the rows chosen, only those in view drawn
function ColumnsTable({ columns, rows, height }: { columns: Column[]; rows: number; height: number }) {
  const [top, setTop] = useState(0);
  const n = Math.max(0, ...columns.map((c) => c.values.length));
  const shown = Math.min(n, rows);
  const first = Math.max(0, Math.floor(top / ROW_H) - 10);
  const last = Math.min(shown, first + Math.ceil(height / ROW_H) + 20);
  return (
    <div className="inspect-scroll nowheel nodrag" style={{ maxHeight: height } as CSSProperties} onScroll={(e) => setTop((e.currentTarget as HTMLElement).scrollTop)}>
      <table>
        <thead>
          <tr>
            <th className="rowhead">#</th>
            {columns.map((c, j) => (
              <th key={j} title={`${c.name}: ${c.values.length} rows`}>
                <div>{c.name || `(${j + 1})`}</div>
                <div className="inspect-role">{ROLE[roleOf(columns, j)] ?? ''}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {first > 0 && (
            <tr style={{ height: first * ROW_H }}>
              <td colSpan={columns.length + 1} />
            </tr>
          )}
          {Array.from({ length: last - first }, (_, k) => {
            const i = first + k;
            return (
              <tr key={i} style={{ height: ROW_H }}>
                <td className="rowhead">{i + 1}</td>
                {columns.map((c, j) => (
                  <td key={j}>{i < c.values.length ? cellText(c, i) : ''}</td>
                ))}
              </tr>
            );
          })}
          {last < shown && (
            <tr style={{ height: (shown - last) * ROW_H }}>
              <td colSpan={columns.length + 1} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// One value: a table (a dataset, a sheet of a workbook, a column), a matrix, a number, a figure
function ValueView({ v, rows, height }: { v: Value; rows: number; height: number }) {
  const [sheet, setSheet] = useState(0);
  if (v.t === 'dataset' || v.t === 'column' || v.t === 'workbook') {
    const sheets = v.t === 'workbook' ? v.v.sheets : [];
    const k = Math.min(sheet, Math.max(0, sheets.length - 1));
    const cols = v.t === 'dataset' ? v.v.columns : v.t === 'column' ? [v.v] : (sheets[k]?.columns ?? []);
    const n = Math.max(0, ...cols.map((c) => c.values.length));
    return (
      <>
        <div className="row wrap inspect-info">
          {v.t === 'workbook' && (
            <select className="nodrag" value={k} title="The sheet shown" onChange={(e) => setSheet(Number(e.target.value))}>
              {sheets.map((q, j) => (
                <option key={j} value={j}>
                  {q.name || `Sheet ${j + 1}`}
                </option>
              ))}
            </select>
          )}
          <span className="muted">
            {v.t === 'workbook' ? `${sheets.length} sheet${sheets.length === 1 ? '' : 's'}; this one: ` : ''}
            {n} row{n === 1 ? '' : 's'} × {cols.length} column{cols.length === 1 ? '' : 's'}
            {n > rows ? ` (first ${rows} shown)` : ''}
          </span>
        </div>
        {cols.length ? <ColumnsTable columns={cols} rows={rows} height={height} /> : <div className="muted">No columns.</div>}
      </>
    );
  }
  if (v.t === 'matrix') {
    const M = v.v;
    const cols: Column[] = Array.from({ length: Math.min(M.cols, 500) }, (_, j) => ({ name: M.colNames?.[j] ?? String(j + 1), values: Float64Array.from({ length: M.rows }, (_, i) => M.v[i * M.cols + j]), role: 'none' as const }));
    return (
      <>
        <div className="muted inspect-info">
          A matrix {M.name ? `“${M.name}” ` : ''}of {M.rows} × {M.cols}
          {M.cols > 500 ? ' (the first 500 columns shown)' : ''}
        </div>
        <ColumnsTable columns={cols} rows={rows} height={height} />
      </>
    );
  }
  if (v.t === 'scalar') return <div className="inspect-info mono">{v.v.name ? `${v.v.name} = ` : ''}{fmtNum(v.v.value, 10)}</div>;
  return <div className="inspect-info muted">A figure of {fmtNum(v.v.width, 4)} × {fmtNum(v.v.height, 4)} {v.v.unit}: connect it to a Merge, or open its node to see it.</div>;
}

// what a target shows: the outputs of a node (a tab each), or the value on a connection
function valuesOf(t: DataTarget, results: Map<string, NodeResult>, nodes: AppNode[], edges: Edge[]): { title: string; node?: AppNode; values: [string, Value][] } | null {
  if (t.kind === 'node') {
    const node = nodes.find((q) => q.id === t.id);
    if (!node) return null;
    const out = results.get(t.id)?.outputs ?? {};
    return { title: nodeDisplayName(node), node, values: Object.entries(out).filter((e): e is [string, Value] => !!e[1]).map(([h, v]) => [outputName(node, h), v]) };
  }
  const e = edges.find((q) => q.id === t.id);
  if (!e) return null;
  const src = nodes.find((q) => q.id === e.source);
  const dst = nodes.find((q) => q.id === e.target);
  const v = results.get(e.source)?.outputs[e.sourceHandle ?? 'out'];
  const from = src ? `${nodeDisplayName(src)} ▸ ${outputName(src, e.sourceHandle ?? 'out')}` : e.source;
  return { title: `${from} → ${dst ? nodeDisplayName(dst) : e.target}`, node: src, values: v ? [[outputName(src, e.sourceHandle ?? 'out'), v]] : [] };
}

export function DataSection({ target, results, nodes, edges, onPin, onClose }: { target: DataTarget; results: Map<string, NodeResult>; nodes: AppNode[]; edges: Edge[]; onPin: (on: boolean) => void; onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState(50);
  const [big, setBig] = useState(false);
  const got = valuesOf(target, results, nodes, edges);
  if (!got) return null;
  const k = Math.min(tab, Math.max(0, got.values.length - 1));
  const cur = got.values[k];
  const color = got.node ? nodeColor(got.node) : 'var(--muted)';
  const body = (height: number) => (
    <>
      {got.values.length > 1 && (
        <div className="row wrap inspect-tabs">
          {got.values.map(([name], j) => (
            <button key={j} className={`nodrag${j === k ? ' on' : ''}`} onClick={() => setTab(j)}>
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="row wrap inspect-info">
        <span className="muted">Rows</span>
        <select className="nodrag" value={rows} title="How many rows are shown (the table scrolls)" onChange={(e) => setRows(Number(e.target.value))}>
          {ROWS.map((r) => (
            <option key={r} value={r}>
              {Number.isFinite(r) ? r : 'all'}
            </option>
          ))}
        </select>
        <span className="grow" />
        {!big && (
          <button className="nodrag" title="The table large" onClick={() => setBig(true)}>
            <Maximize2 {...IC} /> Large
          </button>
        )}
      </div>
      {cur ? <ValueView key={`${target.id}-${k}`} v={cur[1]} rows={rows} height={height} /> : <div className="muted">Nothing here yet: the node gives no data (not connected, waiting, or an error).</div>}
    </>
  );
  return (
    <section className={`inspector-section inspect-section${target.pinned ? ' pinned' : ''}`} style={{ '--node-color': color } as CSSProperties}>
      <div className="inspector-section-head">
        <button className="palette-group" style={{ color }} aria-expanded={open} title={open ? 'Fold' : 'Unfold'} onClick={() => setOpen((o) => !o)}>
          <span className="chev">{open ? <ChevronDown {...IC} /> : <ChevronRight {...IC} />}</span> <span className="ellipsis">Data: {got.title}</span>
        </button>
        <button className={`palette-toggle inspector-pin${target.pinned ? ' on' : ''}`} title={target.pinned ? 'Pinned: stays while other data are inspected; click to unpin' : 'Pin: keep these data while you inspect others'} onClick={() => onPin(!target.pinned)}>
          <PinIcon />
        </button>
        <button className="palette-toggle" title="Close" onClick={onClose}>
          <X {...IC} />
        </button>
      </div>
      {open && <div className="inspect-body">{body(320)}</div>}
      {big &&
        createPortal(
          <div className="big-view nodrag nowheel" onClick={(e) => e.target === e.currentTarget && setBig(false)}>
            <button className="big-close" onClick={() => setBig(false)}>
              <X {...IC} />
            </button>
            <div className="manip-big inspect-big">
              <b>Data: {got.title}</b>
              {body(Math.max(300, (window.innerHeight || 800) * 0.7))}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
