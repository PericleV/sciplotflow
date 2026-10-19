// The options of a node, drawn in its card of the options panel (when the node is clicked or pinned), else nowhere: the
// node itself keeps its figure, its table and its ports. A portal: the options stay in the node's own React tree, so
// everything they use (the node's id, its result, its connections) works as before. The events of the panel do not
// reach the node — a click does not select it, the arrows do not move it, Delete does not remove it (nokey).
import { type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { useInternalNode, useNodeConnections, useNodeId, useReactFlow } from '@xyflow/react';
import { useNodeResult } from '../engine/engine.ts';
import { sheetPort } from '../engine/evaluate.ts';
import type { AppNode } from '../types.ts';
import { InPanel, useSlot } from './inspectorStore.ts';
import { Field, Select } from './ui.tsx';

const stop = (e: SyntheticEvent) => e.stopPropagation();

export function NodeOptions({ children }: { children: ReactNode }) {
  const id = useNodeId();
  const slot = useSlot(id);
  const node = useInternalNode(id ?? '');
  const type = node?.type;
  const r = useNodeResult(id ?? '');
  const { updateNodeData, setEdges } = useReactFlow<AppNode>();
  // a node that takes one sheet of a workbook (a graph, Columns): the sheet — of the workbook connected, or of the
  // Import / Workbook whose sheet shown is connected (choosing one then connects its workbook output instead)
  const port = sheetPort(type);
  const conn = useNodeConnections({ id: id ?? '', handleType: 'target', handleId: port ?? 'dataset' })[0];
  const srcBook = useNodeResult(conn?.source ?? '')?.outputs.book;
  if (!slot) return null;
  const viaShown = !!port && conn?.sourceHandle === 'out' && srcBook?.t === 'workbook' && srcBook.v.sheets.length > 1;
  const sheets = port ? (r?.view.sheets ?? (viaShown && srcBook?.t === 'workbook' ? srcBook.v.sheets.map((q) => q.name) : undefined)) : undefined;
  const sheet = (node?.data as { sheet?: string } | undefined)?.sheet ?? '';
  const chooseSheet = (v: string) => {
    if (!id) return;
    updateNodeData(id, { sheet: v || undefined });
    if (viaShown && conn) setEdges((es) => es.map((e) => (e.source === conn.source && e.sourceHandle === 'out' && e.target === id && e.targetHandle === port ? { ...e, id: `e-${conn.source}-book-${id}-${port}`, sourceHandle: 'book' } : e)));
  };
  // the node's own classes, so the options look as they did in it (their width freed: the panel's)
  return createPortal(
    <div className={`node node-${type} inspector-options nokey`} onClick={stop} onDoubleClick={stop} onContextMenu={stop} onKeyDown={stop} onKeyUp={stop}>
      <InPanel.Provider value>
        {sheets && id && (
          <div className="row">
            <Field label="Sheet" title="The sheet of the workbook these data come from">
              <Select<string> value={sheet} options={[['', viaShown ? 'the one shown in the source' : `first (${sheets[0] ?? ''})`], ...sheets.map((nm): [string, string] => [nm, nm]), ...(sheet && !sheets.includes(sheet) ? [[sheet, `${sheet} (missing)`] as [string, string]] : [])]} onChange={chooseSheet} />
            </Field>
          </div>
        )}
        {children}
      </InPanel.Provider>
    </div>,
    slot,
  );
}
