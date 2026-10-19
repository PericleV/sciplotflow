// Report: a block for every input (the results of a Fit, a test, statistics, values, columns, matrices) — its title,
// its tables, a text of yours under it — with a title, the date and texts before and after; shown in the node as it
// will read, saved as Markdown or text, or copied.
import { Fragment, type ReactNode } from 'react';
import { useNodeConnections, useReactFlow, type NodeProps } from '@xyflow/react';
import { Copy, FileText } from 'lucide-react';
import { useNodeResult } from '../engine/engine.ts';
import { columnLetter } from '../engine/csv.ts';
import { maxOf } from '../engine/minmax.ts';
import { reportMarkdown, reportText, type ReportBlock, type ReportItem, type ReportTable } from '../engine/reportDoc.ts';
import { download } from '../figure/export.ts';
import { REPORT_DEFAULTS } from '../defaults.ts';
import type { AppNode, ReportData, ReportNode } from '../types.ts';
import { NodeOptions } from './NodeOptions.tsx';
import { Fold } from './Fold.tsx';
import { IC } from './iconProps.ts';
import { Check, Field, InPort, Messages, NumInput, Select, TextInput } from './ui.tsx';

// a line of Markdown: **bold**, *italic*, `code`
function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let at = 0;
  let k = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > at) out.push(s.slice(at, m.index));
    out.push(m[1] ? <b key={k++}>{m[1]}</b> : m[2] ? <i key={k++}>{m[2]}</i> : <code key={k++}>{m[3]}</code>);
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}
// a text of yours, as Markdown reads it: headings (#), lists (- or *), paragraphs (an empty line between)
function MiniMarkdown({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) parts.push(<p key={parts.length}>{inline(para.join(' '))}</p>);
    if (list.length)
      parts.push(
        <ul key={parts.length}>
          {list.map((l, j) => (
            <li key={j}>{inline(l)}</li>
          ))}
        </ul>,
      );
    [para, list] = [[], []];
  };
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    const li = /^[-*]\s+(.*)$/.exec(l);
    if (!l) flush();
    else if (h) {
      flush();
      parts.push(<div key={parts.length} className={`report-h${h[1].length}`}>{inline(h[2])}</div>);
    } else if (li) {
      if (para.length) flush();
      list.push(li[1]);
    } else {
      if (list.length) flush();
      para.push(l);
    }
  }
  flush();
  return <>{parts}</>;
}

function TableView({ t }: { t: ReportTable }) {
  return (
    <>
      {t.name && <div className="report-sub">{t.name}</div>}
      <table>
        <thead>
          <tr>
            {t.head.map((h, j) => (
              <th key={j}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.more ? <div className="hint">… {t.more} more rows</div> : null}
    </>
  );
}

export function ReportNodeView({ id, data }: NodeProps<ReportNode>) {
  const { updateNodeData } = useReactFlow<AppNode>();
  const set = (p: Partial<ReportData>) => updateNodeData(id, p);
  const d: ReportData = { ...REPORT_DEFAULTS, ...data };
  const r = useNodeResult(id);
  const conns = useNodeConnections({ handleType: 'target' });
  const used = conns.map((c) => Number(/^in-(\d+)$/.exec(c.targetHandle ?? '')?.[1] ?? -1));
  const count = Math.max(1, Math.max(-1, maxOf(used)) + 2);
  const blocks: ReportBlock[] = r?.view.doc?.blocks ?? [];
  const inputs = r?.view.doc?.inputs ?? [];
  const item = (p: number): ReportItem => d.items?.[p] ?? {};
  const setItem = (p: number, q: Partial<ReportItem>) => set({ items: { ...d.items, [p]: { ...item(p), ...q } } });
  const name = (d.title.trim() || 'report').replace(/[\\/:*?"<>|]+/g, '_');
  return (
    <div className="node node-report">
      {Array.from({ length: count }, (_, k) => {
        const inp = inputs.find((i) => i.port === k);
        return (
          <InPort key={k} label={columnLetter(k)} port="dataset" id={`in-${k}`} title="Results for the report: a dataset (the parameters of a Fit, the table of a test …), a column, a value, a workbook or a matrix — a new port appears when the last one is used">
            <span className="muted ellipsis grow">{inp ? `${inp.title} · ${inp.kind}` : 'connect results'}</span>
          </InPort>
        );
      })}
      <div className="row">
        <button className="nodrag" title="Save the report as Markdown (.md): headings, tables, your texts" onClick={() => download(reportMarkdown(d, blocks), `${name}.md`, 'text/markdown;charset=utf-8')}>
          <FileText {...IC} /> .md
        </button>
        <button className="nodrag" title="Save the report as plain text (.txt): the columns of the tables aligned" onClick={() => download(reportText(d, blocks), `${name}.txt`, 'text/plain;charset=utf-8')}>
          <FileText {...IC} /> .txt
        </button>
        <button className="nodrag" title="Copy the report as Markdown (paste it into a document, a notebook, an e-mail)" onClick={() => void navigator.clipboard.writeText(reportMarkdown(d, blocks))}>
          <Copy {...IC} /> Copy
        </button>
      </div>
      <div className="report-preview nowheel nodrag">
        {d.title.trim() && <div className="report-h1">{d.title}</div>}
        {d.date && <div className="muted">{new Date().toISOString().slice(0, 10)}</div>}
        {d.intro.trim() && <MiniMarkdown text={d.intro} />}
        {blocks.map((b) => (
          <Fragment key={b.port}>
            <div className="report-h2">{b.title}</div>
            {b.line && <p>{b.line}</p>}
            {b.tables.map((t, j) => (
              <TableView key={j} t={t} />
            ))}
            {b.text.trim() && <MiniMarkdown text={b.text} />}
          </Fragment>
        ))}
        {d.outro.trim() && <MiniMarkdown text={d.outro} />}
      </div>
      <NodeOptions>
        <div className="grid2">
          <Field label="Title">
            <TextInput value={d.title} placeholder="none" onChange={(title) => set({ title })} />
          </Field>
          <Check label="The date under it" value={d.date} onChange={(date) => set({ date })} />
          <Field label="Digits" title="Significant digits of the numbers (a value with its error: as many decimals as its error asks)">
            <NumInput className="tiny" min={1} max={15} step={1} value={d.digits} onChange={(v) => set({ digits: Math.max(1, Math.min(15, Math.round(v) || 4)) })} />
          </Field>
          <Check label="A value and its error as one: 1.23 ± 0.04" title="A column followed by its error (designated ±Y / ±X, or named “… error”) written as one" value={d.pm} onChange={(pm) => set({ pm })} />
          <Field label="Rows at most" title="A long table: its first rows shown, the others counted">
            <NumInput className="tiny" min={1} step={10} value={d.maxRows} onChange={(v) => set({ maxRows: Math.max(1, Math.round(v) || 50) })} />
          </Field>
        </div>
        <Field label="Before" title="A text at the top (Markdown: # heading, **bold**, *italic*, - a list)">
          <textarea className="nodrag nowheel formula-lines" rows={3} value={d.intro} placeholder="Sample, conditions, aim …" onChange={(e) => set({ intro: e.target.value })} />
        </Field>
        {inputs.map((inp) => {
          const it = item(inp.port);
          return (
            <Fold key={inp.port} title={`${inp.letter} · ${inp.title}`}>
              <div className="grid2">
                <Check label="In the report" value={!it.hidden} onChange={(v) => setItem(inp.port, { hidden: v ? undefined : true })} />
                <Field label="Title">
                  <TextInput value={it.title ?? ''} placeholder={inp.title} onChange={(title) => setItem(inp.port, { title: title || undefined })} />
                </Field>
                {inp.kind !== 'scalar' && (
                  <>
                    <Field label="Columns" title="The columns shown: 2, B-D (letters), names, A* (a pattern); empty: all">
                      <TextInput value={it.cols ?? ''} placeholder="all" onChange={(cols) => setItem(inp.port, { cols: cols || undefined })} />
                    </Field>
                    <Field label="Laid" title="A row per row of the table, or on its side — a row per column (quantity); automatic: on its side for a few rows and many columns (the parameters of a fit)">
                      <Select<NonNullable<ReportItem['layout']>>
                        value={it.layout ?? 'auto'}
                        options={[
                          ['auto', 'automatic'],
                          ['rows', 'as it is'],
                          ['columns', 'on its side'],
                        ]}
                        onChange={(layout) => setItem(inp.port, { layout: layout === 'auto' ? undefined : layout })}
                      />
                    </Field>
                  </>
                )}
              </div>
              <Field label="Text under it" title="Your text after this block (Markdown)">
                <textarea className="nodrag nowheel formula-lines" rows={2} value={it.text ?? ''} placeholder="What it shows …" onChange={(e) => setItem(inp.port, { text: e.target.value || undefined })} />
              </Field>
            </Fold>
          );
        })}
        <Field label="After" title="A text at the end (Markdown)">
          <textarea className="nodrag nowheel formula-lines" rows={3} value={d.outro} placeholder="Conclusions …" onChange={(e) => set({ outro: e.target.value })} />
        </Field>
      </NodeOptions>
      <Messages result={r} />
    </div>
  );
}
