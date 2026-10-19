// A Note's document: the JSON of the rich-text editor (paragraphs, headings, lists, quotes; bold, italic, colours, fonts,
// sizes; alignment, line spacing, the space before and after a paragraph, its indent). Kept in the project with the
// note's plain text beside it (found by Find node, read by older pages). Pure: no editor here — the node draws the
// beginning of a document with RichView, the editor itself is loaded when the panel or the page opens.

export type RichMark = { type: string; attrs?: Record<string, unknown> };
export type RichDoc = { type: string; attrs?: Record<string, unknown>; content?: RichDoc[]; marks?: RichMark[]; text?: string };

// the base of every document: its font and size (pt), its line spacing and the space after a paragraph (pt)
export const RICH_BASE = { font: 'Arial, Helvetica, sans-serif', size: 11, lineHeight: 1.15, after: 6 };
// one step of indent (pt)
export const INDENT_STEP = 18;
// the blocks numbered as figures (Figure 1, 2 …): a live figure of the project, a picture
export const PICTURES = new Set(['figureRef', 'imageBlock']);

// a plain text as a document: a paragraph a line (an empty line an empty paragraph)
export function docFromText(text: string): RichDoc {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
  return { type: 'doc', content: lines.map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) };
}

// the plain text of a document: its blocks a line each, a list item with its bullet
export function plainOf(doc: RichDoc | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  const inline = (n: RichDoc): string => (n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : n.type === 'inlineMath' ? `$${String(n.attrs?.latex ?? '')}$` : (n.content ?? []).map(inline).join(''));
  const block = (n: RichDoc, prefix = '') => {
    if (n.type === 'bulletList' || n.type === 'orderedList') {
      (n.content ?? []).forEach((li, k) => (li.content ?? []).forEach((b, j) => block(b, j ? '   ' : n.type === 'bulletList' ? '• ' : `${k + 1}. `)));
      return;
    }
    if (n.type === 'blockquote' || n.type === 'doc' || n.type === 'listItem') {
      (n.content ?? []).forEach((b) => block(b, prefix));
      return;
    }
    if (n.type === 'blockMath') lines.push(`${prefix}$$${String(n.attrs?.latex ?? '')}$$`);
    else lines.push(prefix + inline(n));
  };
  block(doc);
  return lines.join('\n');
}

// a document is only plain paragraphs of unformatted text (it can be kept as the plain text alone)
export function isPlain(doc: RichDoc): boolean {
  return (doc.content ?? []).every((p) => p.type === 'paragraph' && !Object.values(p.attrs ?? {}).some((v) => v !== null && v !== undefined && v !== 0 && v !== 'left') && (p.content ?? []).every((t) => t.type === 'text' && !t.marks?.length));
}

// where a figure, a picture, a box or a table stands: its width (% of the page) and its place — left, centre, right; with
// “wrap” (left or right) the text flows beside it
export type Place = { width: number; align: 'left' | 'center' | 'right'; wrap: boolean };
export function placeOf(a: Record<string, unknown> | undefined, width = 100, align: Place['align'] = 'center'): Place {
  const o = a ?? {};
  const al = o.align === 'left' || o.align === 'right' || o.align === 'center' ? o.align : align;
  return { width: Math.min(100, Math.max(5, Number(o.width) || width)), align: al, wrap: !!o.wrap && al !== 'center' };
}
export function placeCss(p: Place): Record<string, string> {
  if (p.wrap) return { width: `${p.width}%`, float: p.align, ...(p.align === 'left' ? { marginLeft: '0', marginRight: '10pt' } : { marginLeft: '10pt', marginRight: '0' }), marginTop: '2pt', marginBottom: '6pt' };
  return { width: `${p.width}%`, marginLeft: p.align === 'left' ? '0' : 'auto', marginRight: p.align === 'right' ? '0' : 'auto' };
}

// a text box's frame (CSS): its place, its border (colour, width in pt), fill, padding (pt)
export function boxCss(a: Record<string, unknown> | undefined): Record<string, string> {
  const o = a ?? {};
  const bw = Number(o.borderWidth ?? 0.75);
  return {
    ...placeCss(placeOf(o, 100, 'left')),
    border: o.border && bw > 0 ? `${bw}pt solid ${String(o.border)}` : 'none',
    ...(o.fill ? { background: String(o.fill) } : {}),
    padding: `${Number(o.padding ?? 6) || 0}pt`,
    boxSizing: 'border-box',
  };
}
export const cssText = (css: Record<string, string>) => Object.entries(css).map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v}`).join('; ');
