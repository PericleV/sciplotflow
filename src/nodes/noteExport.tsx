// A Note exported: as a page to print or save as PDF (the browser's “Save as PDF”: text and live figures stay vector),
// as an HTML file, as a document (.docx — the live figures drawn now at 300 dpi), or as Markdown (with its figures and
// pictures: a .zip of the text and their files). Its name: its first heading, else
// its first line.
import { renderToStaticMarkup } from 'react-dom/server';
import { download, pngBytes } from '../figure/export.ts';
import { FigureSvg } from '../figure/render.tsx';
import { toPt, type Figure } from '../figure/spec.ts';
import { strToU8, zipSync } from 'fflate';
import { noteDocx, type DocxMath, type DocxPicture } from './noteDocx.ts';
import { noteMarkdown } from './noteMd.ts';
import { PICTURES, plainOf, RICH_BASE, type RichDoc } from './richDoc.ts';
import { RichView } from './RichView.tsx';

// the look of a document on paper (as in the app, without its theme)
const DOC_CSS = `
.rich-doc { font-family: ${RICH_BASE.font}; font-size: ${RICH_BASE.size}pt; line-height: ${RICH_BASE.lineHeight}; color: #111111; }
.rich-doc p { margin: 0 0 ${RICH_BASE.after}pt; }
.rich-doc h1 { font-size: 16pt; margin: 12pt 0 6pt; }
.rich-doc h2 { font-size: 13pt; margin: 10pt 0 4pt; }
.rich-doc h3 { font-size: 11.5pt; margin: 8pt 0 4pt; }
.rich-doc > :first-child { margin-top: 0; }
.rich-doc ul, .rich-doc ol { margin: 0 0 6pt; padding-left: 20pt; }
.rich-doc li p { margin: 0 0 2pt; }
.rich-doc blockquote { margin: 0 0 6pt; padding-left: 10pt; border-left: 3px solid #c9c9c9; color: #444444; }
.rich-doc a { color: #1a5fb4; }
.rich-doc code, .rich-doc pre { font-family: 'Courier New', monospace; }
.rich-doc figure.rich-pic { margin-top: 6pt; margin-bottom: 8pt; break-inside: avoid; }
.rich-doc .rich-pic svg, .rich-doc .rich-pic img { display: block; width: 100%; height: auto; }
.rich-doc .rich-caption { font-size: 0.9em; margin-top: 3pt; text-align: center; }
.rich-doc .rich-pic-missing { padding: 12px; border: 1px dashed #bbbbbb; color: #777777; text-align: center; }
.rich-doc .rich-box { margin-bottom: 6pt; break-inside: avoid; }
.rich-doc .rich-box > :last-child { margin-bottom: 0; }
.rich-doc table { border-collapse: collapse; width: 100%; margin: 0 0 6pt; }
.rich-doc td, .rich-doc th { border: 0.75pt solid #777777; padding: 2pt 4pt; vertical-align: top; }
.rich-doc th { background: #f0f0f0; text-align: left; }
.rich-doc td > p, .rich-doc th > p { margin: 0; }
.rich-doc .rich-math-block { text-align: center; margin: 6pt 0; }
.rich-doc::after { content: ''; display: table; clear: both; }
.rich-doc .rich-box, .rich-doc .rich-table { box-sizing: border-box; }
.rich-doc math { font-size: 1.1em; }
`;

export function noteTitle(doc: RichDoc): string {
  const h = doc.content?.find((b) => b.type === 'heading');
  const first = (h ? plainOf({ type: 'doc', content: [h] }) : plainOf(doc).split('\n').find((l) => l.trim())) ?? '';
  // (its formulas left out)
  return first.replace(/\$\$?[^$]*\$\$?/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Note';
}
const fileName = (title: string) => title.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'note';

// a formula drawn for a page (MathML: the browser draws it)
type MathHtml = (latex: string, display: boolean) => string;

// the whole note as an HTML page (A4, 20 mm margins when printed)
export function noteHtml(doc: RichDoc, figure: (node: string) => Figure | undefined, title = noteTitle(doc), math?: MathHtml): string {
  const body = renderToStaticMarkup(<RichView doc={doc} full={{ figure, math }} className="rich-full" />);
  const t = title.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c] ?? c);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title><style>@page { size: A4; margin: 20mm } body { margin: 0; background: #ffffff } @media screen { body { max-width: 170mm; margin: 20mm auto } }${DOC_CSS}</style></head><body>${body}</body></html>`;
}

export function printNote(doc: RichDoc, figure: (node: string) => Figure | undefined, math?: MathHtml) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('The browser blocked the print window: allow pop-ups for this page.');
    return;
  }
  w.document.write(noteHtml(doc, figure, noteTitle(doc), math));
  w.document.close();
  w.focus();
  // the pictures and fonts loaded first
  setTimeout(() => w.print(), 500);
}

export function downloadHtml(doc: RichDoc, figure: (node: string) => Figure | undefined, math?: MathHtml) {
  const title = noteTitle(doc);
  download(noteHtml(doc, figure, title, math), `${fileName(title)}.html`, 'text/html');
}

// a picture of the note made ready for Word: a live figure drawn at 300 dpi, a picture kept as JPEG or redrawn as PNG
async function pictureBytes(n: RichDoc, figure: (node: string) => Figure | undefined): Promise<DocxPicture | null> {
  const a = n.attrs ?? {};
  if (n.type === 'figureRef') {
    const fig = figure(String(a.node ?? ''));
    if (!fig) return null;
    const [W, H] = [toPt(fig.width, fig.unit), toPt(fig.height, fig.unit)];
    const markup = renderToStaticMarkup(<FigureSvg fig={fig} display={{ width: W, height: H }} idPrefix="docx" />);
    const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement as unknown as SVGSVGElement;
    return { bytes: await pngBytes(svg, fig, 300), ext: 'png', w: W, h: H };
  }
  const src = typeof a.src === 'string' ? a.src : '';
  if (!/^data:image\//.test(src)) return null;
  const img = new Image();
  await new Promise((ok, no) => {
    img.onload = ok;
    img.onerror = no;
    img.src = src;
  });
  const [w, h] = [img.naturalWidth || 400, img.naturalHeight || 300];
  if (src.startsWith('data:image/jpeg')) return { bytes: Uint8Array.from(atob(src.split(',')[1]), (c) => c.charCodeAt(0)), ext: 'jpeg', w, h };
  const c = document.createElement('canvas');
  [c.width, c.height] = [w, h];
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), ext: 'png', w, h } : null;
}

export async function downloadDocx(doc: RichDoc, figure: (node: string) => Figure | undefined, math?: DocxMath) {
  const pics = new Map<RichDoc, DocxPicture | null>();
  const walk = async (n: RichDoc) => {
    if (PICTURES.has(n.type)) pics.set(n, await pictureBytes(n, figure).catch(() => null));
    for (const k of n.content ?? []) await walk(k);
  };
  await walk(doc);
  const title = noteTitle(doc);
  const bytes = noteDocx(doc, (n) => pics.get(n) ?? null, math, title);
  download(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), `${fileName(title)}.docx`);
}

export async function downloadMarkdown(doc: RichDoc, figure: (node: string) => Figure | undefined) {
  const title = noteTitle(doc);
  const files: Record<string, Uint8Array> = {};
  const pics = new Map<RichDoc, DocxPicture | null>();
  const walk = async (n: RichDoc) => {
    if (PICTURES.has(n.type)) pics.set(n, await pictureBytes(n, figure).catch(() => null));
    for (const k of n.content ?? []) await walk(k);
  };
  await walk(doc);
  const md = noteMarkdown(doc, (n, k) => {
    const pic = pics.get(n);
    if (!pic) return null;
    const name = `figures/figure-${k}.${pic.ext === 'jpeg' ? 'jpg' : 'png'}`;
    files[name] = pic.bytes;
    return name;
  });
  const base = fileName(title);
  if (!Object.keys(files).length) return download(md, `${base}.md`, 'text/markdown');
  const zip = zipSync({ [`${base}.md`]: strToU8(md), ...files });
  download(new Blob([zip as BlobPart], { type: 'application/zip' }), `${base}.zip`);
}
