// A Note's document drawn for reading, as React elements (no HTML from the document is ever inserted as such): in the
// node its beginning — a figure or a picture as one line, “▣ Figure 2. its caption” —, for the export all of it, the
// live figures drawn from their nodes (full.figure).
import type { CSSProperties, ReactNode } from 'react';
import { FigureSvg } from '../figure/render.tsx';
import { toPt, type Figure } from '../figure/spec.ts';
import { INDENT_STEP, PICTURES, boxCss, placeCss, placeOf, type RichDoc, type RichMark } from './richDoc.ts';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
// a link: only the web and mail addresses become links
const safeHref = (v: unknown) => (typeof v === 'string' && /^(https?:|mailto:)/i.test(v.trim()) ? v.trim() : undefined);
// a picture: only one kept in the note (a data URL)
const safeSrc = (v: unknown) => (typeof v === 'string' && /^data:image\//.test(v) ? v : undefined);

// full: the whole document (the export), with the figures of the project (by node)
export type RichFull = { figure: (node: string) => Figure | undefined; math?: (latex: string, display: boolean) => string };

function marked(text: ReactNode, marks: RichMark[] | undefined, key: number): ReactNode {
  let out = text;
  for (const m of marks ?? []) {
    const a = m.attrs ?? {};
    if (m.type === 'bold') out = <strong>{out}</strong>;
    else if (m.type === 'italic') out = <em>{out}</em>;
    else if (m.type === 'underline') out = <u>{out}</u>;
    else if (m.type === 'strike') out = <s>{out}</s>;
    else if (m.type === 'code') out = <code>{out}</code>;
    else if (m.type === 'subscript') out = <sub>{out}</sub>;
    else if (m.type === 'superscript') out = <sup>{out}</sup>;
    else if (m.type === 'highlight') out = <mark style={{ background: str(a.color) ?? '#fff59d' }}>{out}</mark>;
    else if (m.type === 'textStyle') out = <span style={{ color: str(a.color), fontFamily: str(a.fontFamily), fontSize: str(a.fontSize), background: str(a.backgroundColor) }}>{out}</span>;
    else if (m.type === 'link') out = safeHref(a.href) ? <a href={safeHref(a.href)} target="_blank" rel="noopener noreferrer">{out}</a> : out;
  }
  return <span key={key}>{out}</span>;
}

// a formula: drawn (the export: KaTeX's MathML, its own markup), else its LaTeX
function formula(latex: string, display: boolean, k: number, full?: RichFull): ReactNode {
  if (full?.math) return display ? <div key={k} className="rich-math-block" dangerouslySetInnerHTML={{ __html: full.math(latex, true) }} /> : <span key={k} dangerouslySetInnerHTML={{ __html: full.math(latex, false) }} />;
  return display ? (
    <p key={k} className="rich-math-block">
      <code className="rich-math">{latex}</code>
    </p>
  ) : (
    <code key={k} className="rich-math">
      {latex}
    </code>
  );
}

function inline(nodes: RichDoc[] | undefined, full?: RichFull): ReactNode[] {
  return (nodes ?? []).map((n, k) =>
    n.type === 'hardBreak' ? <br key={k} /> : n.type === 'text' ? marked(n.text ?? '', n.marks, k) : n.type === 'inlineMath' ? formula(String(n.attrs?.latex ?? ''), false, k, full) : <span key={k}>{inline(n.content, full)}</span>,
  );
}

// a paragraph's or heading's own settings: alignment, line spacing, space before and after, indent
function blockStyle(attrs: Record<string, unknown> | undefined): CSSProperties {
  const a = attrs ?? {};
  const s: CSSProperties = {};
  if (str(a.textAlign) && a.textAlign !== 'left') s.textAlign = a.textAlign as CSSProperties['textAlign'];
  if (str(a.lineHeight)) s.lineHeight = a.lineHeight as string;
  if (num(a.spaceBefore) !== undefined) s.marginTop = `${a.spaceBefore}pt`;
  if (num(a.spaceAfter) !== undefined) s.marginBottom = `${a.spaceAfter}pt`;
  if (num(a.indent)) s.marginLeft = `${(a.indent as number) * INDENT_STEP}pt`;
  return s;
}


function Blocks({ blocks, full, numbers }: { blocks: RichDoc[]; full?: RichFull; numbers: Map<RichDoc, number> }) {
  const block = (n: RichDoc, k: number): ReactNode => {
    const kids = n.content ?? [];
    const a = n.attrs ?? {};
    if (PICTURES.has(n.type)) {
      const no = numbers.get(n) ?? 0;
      const caption = str(a.caption);
      const label = (
        <>
          <b>Figure {no}.</b> {caption ?? ''}
        </>
      );
      if (!full) return <p key={k} className="rich-pic-line">▣ {label}</p>;
      const fig = n.type === 'figureRef' ? full.figure(String(a.node ?? '')) : undefined;
      const src = n.type === 'imageBlock' ? safeSrc(a.src) : undefined;
      return (
        <figure key={k} className="rich-pic" style={placeCss(placeOf(a, 100, 'center')) as CSSProperties}>
          {fig ? <FigureSvg fig={fig} display={{ width: 600, height: (600 * toPt(fig.height, fig.unit)) / toPt(fig.width, fig.unit) }} idPrefix={`ex${no}`} /> : src ? <img src={src} alt={str(a.alt) ?? caption ?? ''} /> : <div className="rich-pic-missing">(a figure no longer in the project)</div>}
          {caption && <figcaption className="rich-caption">{label}</figcaption>}
        </figure>
      );
    }
    switch (n.type) {
      case 'paragraph':
        return <p key={k} style={blockStyle(a)}>{kids.length ? inline(kids, full) : <br />}</p>;
      case 'heading': {
        const H = `h${Math.min(3, Math.max(1, num(a.level) ?? 1))}` as 'h1' | 'h2' | 'h3';
        return <H key={k} style={blockStyle(a)}>{inline(kids, full)}</H>;
      }
      case 'bulletList':
        return <ul key={k}>{kids.map(block)}</ul>;
      case 'orderedList':
        return <ol key={k} start={num(a.start)}>{kids.map(block)}</ol>;
      case 'listItem':
        return <li key={k}>{kids.map(block)}</li>;
      case 'blockquote':
        return <blockquote key={k}>{kids.map(block)}</blockquote>;
      case 'codeBlock':
        return <pre key={k}>{inline(kids)}</pre>;
      case 'horizontalRule':
        return <hr key={k} />;
      case 'blockMath':
        return formula(String(a.latex ?? ''), true, k, full);
      case 'textBox':
        return (
          <div key={k} className="rich-box" style={boxCss(a) as CSSProperties}>
            {kids.map(block)}
          </div>
        );
      case 'table':
        return (
          <table key={k} className="rich-table" style={placeCss(placeOf(a, 100, 'center')) as CSSProperties}>
            <tbody>{kids.map(block)}</tbody>
          </table>
        );
      case 'tableRow':
        return <tr key={k}>{kids.map(block)}</tr>;
      case 'tableHeader':
      case 'tableCell': {
        const Cell = n.type === 'tableHeader' ? 'th' : 'td';
        return (
          <Cell key={k} colSpan={num(a.colspan)} rowSpan={num(a.rowspan)}>
            {kids.map(block)}
          </Cell>
        );
      }
      default:
        return kids.length ? <div key={k}>{kids.map(block)}</div> : null;
    }
  };
  return <>{blocks.map(block)}</>;
}

// the document, or its first blocks (limit)
export function RichView({ doc, limit, full, className = '' }: { doc: RichDoc; limit?: number; full?: RichFull; className?: string }) {
  const blocks = doc.content ?? [];
  const shown = limit ? blocks.slice(0, limit) : blocks;
  // the pictures numbered in the order of the document
  const numbers = new Map<RichDoc, number>();
  const walk = (n: RichDoc) => {
    if (PICTURES.has(n.type)) numbers.set(n, numbers.size + 1);
    n.content?.forEach(walk);
  };
  walk(doc);
  return (
    <div className={`rich-doc ${className}`}>
      <Blocks blocks={shown} full={full} numbers={numbers} />
      {limit && blocks.length > limit && <p className="rich-more">…</p>}
    </div>
  );
}
