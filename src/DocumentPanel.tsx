// Update document: the figures of a Word or PowerPoint document that carry this project are drawn again from the
// project as it is now and put in their place (their SVG and PNG, their size on the page) — a new document is saved,
// the one opened stays as it was. Figures of other projects, or whose node is gone, are listed and left alone.
import { useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NodeResult } from './engine/evaluate.ts';
import { makeEmbedded, projectRevision } from './figure/embed.ts';
import { download, pngBytes, svgText } from './figure/export.ts';
import { readOffice, writeOffice, type OfficeDoc, type Replacement } from './figure/office.ts';
import { FigureSvg } from './figure/render.tsx';
import { toPt, type Figure } from './figure/spec.ts';
import type { Project } from './project.ts';
import type { AppNode, PageData } from './types.ts';
import { X } from 'lucide-react';
import { IC } from './nodes/iconProps.ts';

type Row = { k: number; status: 'update' | 'current' | 'other' | 'gone'; label: string; fig?: Figure; page?: Partial<PageData> };

// a node of the project by the groups it is in
function nodeAt(nodes: AppNode[], path: string[], id: string): AppNode | undefined {
  let level = nodes;
  for (const g of path) {
    const n = level.find((q) => q.id === g);
    if (n?.type !== 'subgraph') return undefined;
    level = n.data.nodes;
  }
  return level.find((q) => q.id === id);
}
// the figure as a standalone SVG element (drawn off the screen)
function svgElement(fig: Figure): SVGSVGElement | null {
  const text = renderToStaticMarkup(<FigureSvg fig={fig} display={{ width: 600, height: (600 * toPt(fig.height, fig.unit)) / toPt(fig.width, fig.unit) }} idPrefix="docfig" />);
  const el = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  return el instanceof SVGSVGElement || el.tagName === 'svg' ? (el as unknown as SVGSVGElement) : null;
}

export function DocumentPanel(props: { onClose: () => void; current: () => Project; id: string; results: Map<string, NodeResult> }) {
  const [doc, setDoc] = useState<{ name: string; doc: OfficeDoc } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [size, setSize] = useState<'figure' | 'document'>('figure');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const open = async (f: File) => {
    setMsg('');
    const d = readOffice(new Uint8Array(await f.arrayBuffer()), f.name);
    if (typeof d === 'string') return setMsg(d);
    const p = props.current();
    const rev = await projectRevision(p);
    const list: Row[] = d.figures.map((x, k) => {
      const e = x.embedded;
      const label = `${e.figure.name || e.figure.node}${e.projectName ? ` · ${e.projectName}` : ''} (${x.source.replace(/^.*\//, '')}, exported ${new Date(e.exported).toLocaleDateString()})`;
      if (e.projectId !== props.id) return { k, status: 'other', label };
      const key = [...e.figure.path, e.figure.node].join('/');
      const fig = props.results.get(key)?.view.figure;
      const node = nodeAt(p.nodes, e.figure.path, e.figure.node);
      if (!fig || !node) return { k, status: 'gone', label };
      const page = (node.data as { page?: Partial<PageData> }).page;
      return { k, status: e.revision === rev ? 'current' : 'update', label, fig, ...(page ? { page } : {}) };
    });
    setDoc({ name: f.name, doc: d });
    setRows(list);
    setChosen(new Set(list.filter((r) => r.status === 'update' || r.status === 'current').map((r) => r.k)));
    if (!d.figures.length) setMsg(`No figure with a SciPlotFlow project in “${f.name}” (${d.pictures} picture${d.pictures === 1 ? '' : 's'}): insert the figures exported as SVG with “project inside” (Word and PowerPoint re-encode an inserted PNG, which loses the project; an SVG exported by an earlier version of SciPlotFlow loses it too — export it again).`);
  };

  const update = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const p = props.current();
      const reps: Replacement[] = [];
      for (const r of rows) {
        if (!chosen.has(r.k) || !r.fig) continue;
        const x = doc.doc.figures[r.k];
        const el = svgElement(r.fig);
        if (!el) throw new Error(`The figure “${x.embedded.figure.name}” could not be drawn.`);
        const e = await makeEmbedded(p, props.id, x.embedded.figure, r.page?.embed === 'nodata' ? 'nodata' : 'full');
        const dpi = r.page?.dpi ?? 300;
        reps.push({
          part: x.part,
          index: x.index,
          ...(x.svg ? { svg: new TextEncoder().encode(svgText(el, r.fig, e)) } : {}),
          ...(x.png ? { png: await pngBytes(el, r.fig, dpi, x.svg ? undefined : e) } : {}),
          ...(size === 'figure' ? { widthPt: toPt(r.fig.width, r.fig.unit), heightPt: toPt(r.fig.height, r.fig.unit) } : {}),
        });
      }
      if (!reps.length) return setMsg('No figure chosen.');
      const out = writeOffice(doc.doc, reps);
      const base = doc.name.replace(/\.(docx|pptx)$/i, '');
      download(new Blob([out as BlobPart], { type: doc.doc.kind === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), `${base} (updated).${doc.doc.kind}`);
      setMsg(`${reps.length} figure${reps.length > 1 ? 's' : ''} updated: “${base} (updated).${doc.doc.kind}” saved (the document opened is unchanged).`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const STATUS: Record<Row['status'], string> = { update: 'older — will be updated', current: 'as the project now', other: 'another project — left alone', gone: 'its figure is no longer in this project' };
  return (
    <aside className="library projects-panel">
      <header>
        <strong>Update figures in a document</strong>
        <button onClick={props.onClose} aria-label="Close"><X {...IC} /></button>
      </header>
      <div className="row wrap">
        <button onClick={() => file.current?.click()} title="A Word (.docx) or PowerPoint (.pptx) document with figures exported from this project (with “project inside”)">
          Choose a document…
        </button>
        <input
          ref={file}
          type="file"
          accept=".docx,.pptx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void open(f);
          }}
        />
        {doc && <span className="muted">{doc.name}</span>}
      </div>
      {msg && <div className="msg warn">{msg}</div>}
      {rows.length > 0 && (
        <>
          <div className="lib-list">
            {rows.map((r) => (
              <label className="project-item" key={r.k} title={STATUS[r.status]}>
                <input
                  type="checkbox"
                  disabled={!r.fig}
                  checked={chosen.has(r.k)}
                  onChange={(e) =>
                    setChosen((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(r.k);
                      else n.delete(r.k);
                      return n;
                    })
                  }
                />
                <div>
                  <b>{r.label}</b>
                  <div className="muted">{STATUS[r.status]}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="row wrap">
            <select value={size} onChange={(e) => setSize(e.target.value as 'figure' | 'document')} title="The size of every figure on the page: its own (the page size set in its Plot / Merge), or as it is in the document">
              <option value="figure">size: the figure's</option>
              <option value="document">size: as in the document</option>
            </select>
            <button className="btn-run" disabled={busy || !chosen.size} onClick={() => void update()}>
              Update and save the document
            </button>
          </div>
        </>
      )}
      <div className="hint">
        The figures exported with “project inside” keep the project's identity: those of this project are drawn again from it as it is now — their SVG (and the PNG shown by older programs), their size — and a new document is saved. Nothing else in the document changes.
      </div>
    </aside>
  );
}
