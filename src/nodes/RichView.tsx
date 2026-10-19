// A Note's document drawn for reading (the node shows its beginning): its blocks and the formatting of its text, as
// React elements (no HTML from the document is ever inserted as such).
import type { CSSProperties, ReactNode } from 'react';
import { INDENT_STEP, type RichDoc, type RichMark } from './richDoc.ts';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
// a link: only the web and mail addresses become links
const safeHref = (v: unknown) => (typeof v === 'string' && /^(https?:|mailto:)/i.test(v.trim()) ? v.trim() : undefined);

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

function inline(nodes: RichDoc[] | undefined): ReactNode[] {
  return (nodes ?? []).map((n, k) => (n.type === 'hardBreak' ? <br key={k} /> : n.type === 'text' ? marked(n.text ?? '', n.marks, k) : <span key={k}>{inline(n.content)}</span>));
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

function block(n: RichDoc, k: number): ReactNode {
  const kids = n.content;
  switch (n.type) {
    case 'paragraph':
      return <p key={k} style={blockStyle(n.attrs)}>{kids?.length ? inline(kids) : <br />}</p>;
    case 'heading': {
      const level = Math.min(3, Math.max(1, num(n.attrs?.level) ?? 1));
      const H = `h${level}` as 'h1' | 'h2' | 'h3';
      return <H key={k} style={blockStyle(n.attrs)}>{inline(kids)}</H>;
    }
    case 'bulletList':
      return <ul key={k}>{(kids ?? []).map(block)}</ul>;
    case 'orderedList':
      return <ol key={k} start={num(n.attrs?.start)}>{(kids ?? []).map(block)}</ol>;
    case 'listItem':
      return <li key={k}>{(kids ?? []).map(block)}</li>;
    case 'blockquote':
      return <blockquote key={k}>{(kids ?? []).map(block)}</blockquote>;
    case 'codeBlock':
      return <pre key={k}>{inline(kids)}</pre>;
    case 'horizontalRule':
      return <hr key={k} />;
    default:
      return kids ? <div key={k}>{kids.map(block)}</div> : null;
  }
}

// the document, or its first blocks (limit)
export function RichView({ doc, limit, className = '' }: { doc: RichDoc; limit?: number; className?: string }) {
  const blocks = doc.content ?? [];
  const shown = limit ? blocks.slice(0, limit) : blocks;
  return (
    <div className={`rich-doc ${className}`}>
      {shown.map(block)}
      {limit && blocks.length > limit && <p className="rich-more">…</p>}
    </div>
  );
}
